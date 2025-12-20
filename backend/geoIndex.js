// geoIndex.js
/**
 * 地理名称索引与匹配模块
 */

// fs: 文件系统 path: 路径处理
const fs = require('fs');
const path = require('path');

const DATA_GEO_FILE = path.join(__dirname, '../data/geo/china-county.json');

const FALLBACK_PROVINCE_GEO_FILE = path.join(__dirname, '../public/vendor/echarts/map/json/china.json');

const PROVINCE_CITIES_DIR = path.join(__dirname, '../data/geo/provinces');
const CITY_DISTRICTS_DIR = path.join(__dirname, '../data/geo/cities');

function safeJsonParse(text, label) {
    // 安全的 JSON 解析，失败时抛出带标签的错误
  try {
    return JSON.parse(text);
  } catch (e) {
    const msg = label ? `${label} JSON 解析失败` : 'JSON 解析失败';
    const err = new Error(`${msg}: ${e.message}`);
    err.cause = e;
    throw err;
  }
}

function normalizeName(raw) {
    // 标准化名称：去空白，剥离常见行政区划后缀
  const s = String(raw || '').trim();
  if (!s) return '';

  // 去空白（含全角空格）
  let x = s.replace(/[\s\u3000]+/g, '');

  // 常见后缀归一（不追求完美，只求稳健）
  x = x
    .replace(/特别行政区/g, '')
    .replace(/维吾尔自治区|壮族自治区|回族自治区/g, '自治区')
    .replace(/自治区/g, '')
    .replace(/自治州/g, '')
    .replace(/地区/g, '')
    .replace(/盟/g, '')
    .replace(/市/g, '')
    .replace(/省/g, '')
    .replace(/县/g, '')
    .replace(/区/g, '')
    .replace(/旗/g, '')
    .replace(/林区/g, '')
    .replace(/矿区/g, '');

  return x;
}

function extractCandidateQueries(input) {
  const raw = String(input || '').trim();
  if (!raw) return [];

  const compact = raw.replace(/[\s\u3000]+/g, '');
  const pieces = [compact];

  // 按行政层级关键词切分，取更“末端”的片段以匹配县/区名
  const splitTokens = ['特别行政区', '自治区', '省', '自治州', '地区', '市'];
  let current = compact;
  for (const t of splitTokens) {
    if (!current.includes(t)) continue;
    const parts = current.split(t).filter(Boolean);
    if (parts.length > 0) {
      current = parts[parts.length - 1];
      pieces.push(current);
    }
  }

  // 再尝试按“县/区/旗”切分取末段
  for (const t of ['县', '区', '旗']) {
    if (!compact.includes(t)) continue;
    const parts = compact.split(t).filter(Boolean);
    if (parts.length > 0) pieces.push(parts[parts.length - 1] + t);
  }

  // 去重
  return Array.from(new Set(pieces.filter(Boolean)));
}

// 轻量 Levenshtein（候选数较大时会被频繁调用，保持实现简洁）
function levenshtein(a, b) {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;

  const v0 = new Array(bl + 1);
  const v1 = new Array(bl + 1);
  for (let i = 0; i <= bl; i++) v0[i] = i;

  for (let i = 0; i < al; i++) {
    v1[0] = i + 1;
    const ac = a.charCodeAt(i);
    for (let j = 0; j < bl; j++) {
      const cost = ac === b.charCodeAt(j) ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= bl; j++) v0[j] = v1[j];
  }
  return v0[bl];
}

function scoreSimilarity(inputNorm, candidateNorm) {
  if (!inputNorm || !candidateNorm) return 0;
  if (inputNorm === candidateNorm) return 1;

  // 子串命中优先（输入全名包含县/区名）
  if (inputNorm.includes(candidateNorm) || candidateNorm.includes(inputNorm)) {
    const ratio = Math.min(inputNorm.length, candidateNorm.length) / Math.max(inputNorm.length, candidateNorm.length);
    return 0.92 + 0.08 * ratio;
  }

  const d = levenshtein(inputNorm, candidateNorm);
  const maxLen = Math.max(inputNorm.length, candidateNorm.length) || 1;
  const base = 1 - d / maxLen;

  // 首字相同稍微加分
  const boost = inputNorm[0] && candidateNorm[0] && inputNorm[0] === candidateNorm[0] ? 0.03 : 0;
  return Math.max(0, Math.min(1, base + boost));
}

function pickCoord(props) {
  const c = props?.centroid || props?.center;
  if (Array.isArray(c) && c.length === 2 && Number.isFinite(Number(c[0])) && Number.isFinite(Number(c[1]))) {
    return [Number(c[0]), Number(c[1])];
  }
  return null;
}

function normalizeAdcode(adcode) {
  if (adcode === null || adcode === undefined) return null;
  const s = String(adcode).trim();
  return s ? s : null;
}

function inferLevelFromId(id, fallbackLevel) {
  if (fallbackLevel) return String(fallbackLevel);
  const s = String(id || '').trim();
  if (!/^\d{6}$/.test(s)) return null;
  if (s.endsWith('0000')) return 'province';
  if (s.endsWith('00')) return 'city';
  return 'district';
}

function levelRank(level) {
  const l = String(level || '').toLowerCase();
  if (l === 'district' || l === 'county') return 3;
  if (l === 'city') return 2;
  if (l === 'province') return 1;
  return 0;
}

function loadGeoJson() {
  const candidates = [DATA_GEO_FILE];
  let lastErr = null;

  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const geo = safeJsonParse(raw, path.basename(filePath));
      return {
        geo,
        source: `data/geo/${path.basename(filePath)}`
      };
    } catch (e) {
      lastErr = e;
      // 继续尝试下一个候选文件
    }
  }

  // 若没有全国县级索引文件：从本地拆分 GeoJSON（省->市、 市->区县）构建索引。
  // 注意：这里只需要 feature.properties（名称/行政区划/中心点），不需要 geometry。
  try {
    const out = { type: 'FeatureCollection', features: [] };

    // 省级
    if (fs.existsSync(FALLBACK_PROVINCE_GEO_FILE)) {
      const raw = fs.readFileSync(FALLBACK_PROVINCE_GEO_FILE, 'utf8');
      const j = safeJsonParse(raw, 'china(province)');
      const feats = Array.isArray(j?.features) ? j.features : [];
      for (const f of feats) {
        if (f?.properties) out.features.push({ type: 'Feature', properties: f.properties });
      }
    }

    function addFromDir(dirPath, label) {
      if (!fs.existsSync(dirPath)) return;
      const files = fs.readdirSync(dirPath).filter((x) => x.endsWith('_full.json'));
      for (const fileName of files) {
        try {
          const fp = path.join(dirPath, fileName);
          const raw = fs.readFileSync(fp, 'utf8');
          const j = safeJsonParse(raw, `${label}:${fileName}`);
          const feats = Array.isArray(j?.features) ? j.features : [];
          for (const f of feats) {
            if (f?.properties) out.features.push({ type: 'Feature', properties: f.properties });
          }
        } catch (e) {
          // 索引阶段跳过坏文件，避免服务不可用
        }
      }
    }

    // 市级（各省内市边界）
    addFromDir(PROVINCE_CITIES_DIR, 'province-cities');
    // 区县级（各市内区县边界）
    addFromDir(CITY_DISTRICTS_DIR, 'city-districts');

    if (Array.isArray(out.features) && out.features.length > 0) {
      return { geo: out, source: 'data/geo/{provinces,cities}/*_full.json' };
    }
  } catch (e) {
    lastErr = e;
  }

  // 兜底用省级地图（即使县级文件坏了，也不让服务直接崩）
  try {
    const raw = fs.readFileSync(FALLBACK_PROVINCE_GEO_FILE, 'utf8');
    const geo = safeJsonParse(raw, 'china(province)');
    return { geo, source: 'public/vendor/echarts/map/json/china.json' };
  } catch (e) {
    // 最后兜底：返回空 GeoJSON，避免进程启动失败
    const errMsg = (lastErr || e)?.message || 'unknown';
    return {
      geo: { type: 'FeatureCollection', features: [] },
      source: `invalid-geojson(${errMsg})`
    };
  }
}

function buildIndex(geo) {
  const features = Array.isArray(geo?.features) ? geo.features : [];

  const items = [];
  const byId = new Map();

  for (const f of features) {
    const props = f?.properties || {};
    const name = String(
      props.name ??
        props.NAME ??
        props.fullname ??
        props.FULLNAME ??
        props.name_zh ??
        props.NAME_CHN ??
        ''
    ).trim();
    if (!name) continue;

    const id =
      normalizeAdcode(props.adcode ?? props.ad_code ?? props.adCode ?? props.ADCODE ?? props.code ?? props.CODE) ||
      name;
    let level = props.level ? String(props.level) : null;
    const centroid = pickCoord(props);
    let acroutes = Array.isArray(props.acroutes) ? props.acroutes.map(normalizeAdcode).filter(Boolean) : null;

    // 若数据缺少 level/acroutes，则根据 adcode 推断，增强“河南省许昌市魏都区”这类输入的区县命中率。
    const sid = String(id);
    if (!level && /^\d{6}$/.test(sid)) {
      if (sid.endsWith('0000')) level = 'province';
      else if (sid.endsWith('00')) level = 'city';
      else level = 'district';
    }
    if ((!acroutes || acroutes.length === 0) && /^\d{6}$/.test(sid)) {
      if (sid.endsWith('0000')) acroutes = ['100000'];
      else if (sid.endsWith('00')) acroutes = ['100000', sid.slice(0, 2) + '0000'];
      else acroutes = ['100000', sid.slice(0, 2) + '0000', sid.slice(0, 4) + '00'];
    }

    const norm = normalizeName(name);
    const entry = { id, name, norm, level, centroid, acroutes };

    items.push(entry);
    if (!byId.has(String(id))) byId.set(String(id), entry);
  }

  return { items, byId };
}

function createGeoIndex() {
  const { geo, source } = loadGeoJson();
  const { items, byId } = buildIndex(geo);

  // 为 acroutes 生成 adcode->name 的映射（若数据里包含多层级会更准）
  const nameById = new Map();
  for (const it of items) nameById.set(String(it.id), it.name);

  function lookupRegionMeta(id) {
    const it = byId.get(String(id));
    return it ? { id: it.id, name: it.name, level: it.level, centroid: it.centroid } : null;
  }

  function matchPlaceName(placeName) {
    const raw = String(placeName || '').trim();
    if (!raw) {
      return { ok: false, message: '地区名称不能为空' };
    }

    const compactRaw = raw.replace(/[\s\u3000]+/g, '');
    const rawNorm = normalizeName(raw);

    const queries = extractCandidateQueries(raw);
    const scored = [];

    for (const q of queries) {
      const qNorm = normalizeName(q);
      if (!qNorm) continue;

      // 先尝试 exact
      const exactMatches = items.filter(it => it.norm === qNorm);
      if (exactMatches.length > 0) {
        // 同名/同归一化名可能有多个（跨省同名）。优先：输入包含上级（acroutes）者；再优先更细层级。
        let bestExact = exactMatches[0];
        if (exactMatches.length > 1) {
          const inputNorm = rawNorm;
          bestExact = exactMatches
            .map((it) => {
              const itLevel = inferLevelFromId(it.id, it.level);
              let bonus = 0;
              // 输入包含完整名称（含后缀）强加分
              if (it?.name && compactRaw.includes(String(it.name).replace(/[\s\u3000]+/g, ''))) bonus += 0.25;
              // 输入包含上级名称（acroutes）加分
              if (it.acroutes && it.acroutes.length > 0) {
                const routeNames = it.acroutes.map(id => nameById.get(String(id))).filter(Boolean);
                for (const rn of routeNames) {
                  const rnNorm = normalizeName(rn);
                  if (rnNorm && inputNorm.includes(rnNorm)) {
                    bonus += 0.08;
                    break;
                  }
                }
              }
              // 细层级偏好
              bonus += 0.02 * levelRank(itLevel);
              return { it, bonus, itLevel };
            })
            .sort((a, b) => {
              if (b.bonus !== a.bonus) return b.bonus - a.bonus;
              const br = levelRank(b.itLevel) - levelRank(a.itLevel);
              if (br) return br;
              return String(b.it.name || '').length - String(a.it.name || '').length;
            })[0].it;
        }

        return {
          ok: true,
          matched: {
            id: String(bestExact.id),
            name: bestExact.name,
            level: inferLevelFromId(bestExact.id, bestExact.level),
            centroid: bestExact.centroid,
            score: 1,
            source: 'exact'
          }
        };
      }

      // 再做全量相似度（增加：子串命中 + 细层级偏好 + 上级命中）
      for (const it of items) {
        let score = scoreSimilarity(qNorm, it.norm);

        const itLevel = inferLevelFromId(it.id, it.level);

        // 输入包含候选完整名称（含后缀），强加分：优先匹配到“魏都区”这种末端
        if (it?.name && compactRaw.includes(String(it.name).replace(/[\s\u3000]+/g, ''))) {
          score = Math.min(1, score + 0.25);
        }

        // 细层级偏好：同等相似度下更偏向区县
        score = Math.min(1, score + 0.02 * levelRank(itLevel));

        // 若输入包含上级名称，则加一点分（依赖 acroutes + 映射）
        if (score < 0.999 && it.acroutes && it.acroutes.length > 0) {
          const routeNames = it.acroutes.map(id => nameById.get(String(id))).filter(Boolean);
          const inputNorm = rawNorm;
          for (const rn of routeNames) {
            const rnNorm = normalizeName(rn);
            if (rnNorm && inputNorm.includes(rnNorm)) {
              score = Math.min(1, score + 0.05);
              break;
            }
          }
        }

        if (score > 0.55) {
          scored.push({ it, score });
        }
      }
    }

    if (scored.length === 0) {
      return { ok: false, message: '未能匹配到相近地名，请检查输入是否为完整地区名称' };
    }

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const al = inferLevelFromId(a.it.id, a.it.level);
      const bl = inferLevelFromId(b.it.id, b.it.level);
      const r = levelRank(bl) - levelRank(al);
      if (r) return r;
      return String(b.it.name || '').length - String(a.it.name || '').length;
    });
    const best = scored[0];

    return {
      ok: true,
      matched: {
        id: String(best.it.id),
        name: best.it.name,
        level: inferLevelFromId(best.it.id, best.it.level),
        centroid: best.it.centroid,
        score: Number(best.score.toFixed(4)),
        source: 'fuzzy'
      },
      alternatives: scored.slice(1, 6).map(x => ({
        id: String(x.it.id),
        name: x.it.name,
        level: x.it.level,
        score: Number(x.score.toFixed(4))
      }))
    };
  }

  function getGeoJson() {
    return geo;
  }

  function getMeta() {
    const levels = new Set(items.map(x => x.level).filter(Boolean));
    return {
      source,
      featureCount: items.length,
      levels: Array.from(levels)
    };
  }

  return {
    getGeoJson,
    getMeta,
    lookupRegionMeta,
    matchPlaceName
  };
}

module.exports = {
  createGeoIndex
};
