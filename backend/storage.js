const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DEFAULT_STATE = {
  litRegionState: {},
  submissions: [],
  lastUpdated: new Date().toISOString()
};

// 兼容：旧版省份列表（用于历史数据迁移、兜底显示）
const PROVINCES = [
  { id: '11', name: '北京市' },
  { id: '12', name: '天津市' },
  { id: '13', name: '河北省' },
  { id: '14', name: '山西省' },
  { id: '15', name: '内蒙古自治区' },
  { id: '21', name: '辽宁省' },
  { id: '22', name: '吉林省' },
  { id: '23', name: '黑龙江省' },
  { id: '31', name: '上海市' },
  { id: '32', name: '江苏省' },
  { id: '33', name: '浙江省' },
  { id: '34', name: '安徽省' },
  { id: '35', name: '福建省' },
  { id: '36', name: '江西省' },
  { id: '37', name: '山东省' },
  { id: '41', name: '河南省' },
  { id: '42', name: '湖北省' },
  { id: '43', name: '湖南省' },
  { id: '44', name: '广东省' },
  { id: '45', name: '广西壮族自治区' },
  { id: '46', name: '海南省' },
  { id: '50', name: '重庆市' },
  { id: '51', name: '四川省' },
  { id: '52', name: '贵州省' },
  { id: '53', name: '云南省' },
  { id: '54', name: '西藏自治区' },
  { id: '61', name: '陕西省' },
  { id: '62', name: '甘肃省' },
  { id: '63', name: '青海省' },
  { id: '64', name: '宁夏回族自治区' },
  { id: '65', name: '新疆维吾尔自治区' }
];

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function migrateStateIfNeeded(state) {
  if (!state || typeof state !== 'object') return deepClone(DEFAULT_STATE);

  // 已是新结构
  if (state.litRegionState && state.submissions) {
    // 兼容：若旧字段仍是 isLit 结构，转换为 count
    for (const [id, v] of Object.entries(state.litRegionState || {})) {
      if (v && typeof v === 'object' && typeof v.count !== 'number') {
        const isLit = Boolean(v.isLit);
        const count = isLit ? 1 : 0;
        state.litRegionState[id] = {
          count,
          firstLitAt: v.firstLitAt || (isLit ? (v.litAt || null) : null),
          lastLitAt: v.lastLitAt || (isLit ? (v.litAt || null) : null),
          firstNickname: v.firstNickname || null,
          matchedName: v.matchedName || String(id)
        };
      }
    }
    if (!state.lastUpdated) state.lastUpdated = new Date().toISOString();
    return state;
  }

  // 旧结构：provinceLitState/submissions
  const migrated = {
    litRegionState: {},
    submissions: Array.isArray(state.submissions) ? state.submissions : [],
    lastUpdated: state.lastUpdated || new Date().toISOString()
  };

  if (state.provinceLitState && typeof state.provinceLitState === 'object') {
    for (const [provinceId, lit] of Object.entries(state.provinceLitState)) {
      const province = PROVINCES.find(p => p.id === provinceId);
      migrated.litRegionState[provinceId] = {
        count: Boolean(lit?.isLit) ? 1 : 0,
        firstLitAt: lit?.litAt || null,
        lastLitAt: lit?.litAt || null,
        firstNickname: lit?.firstNickname || null,
        matchedName: province?.name || String(provinceId)
      };
    }
  }

  return migrated;
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, 'utf8');
      const parsed = JSON.parse(data);
      const migrated = migrateStateIfNeeded(parsed);

      // 如果发生迁移，落盘一次
      if (!parsed.litRegionState && migrated.litRegionState) {
        saveState(migrated);
      }

      return migrated;
    }
  } catch (err) {
    console.error('❌ 读取状态文件失败:', err.message);
  }
  return deepClone(DEFAULT_STATE);
}

function saveState(state) {
  try {
    const next = state && typeof state === 'object' ? state : deepClone(DEFAULT_STATE);
    next.lastUpdated = new Date().toISOString();
    fs.writeFileSync(STATE_FILE, JSON.stringify(next, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('❌ 保存状态文件失败:', err.message);
    return false;
  }
}

function getState() {
  return loadState();
}

function setState(newState) {
  return saveState(newState);
}

function addSubmission(nickname, inputPlaceName, matched, clientIp) {
  const state = loadState();
  const submission = {
    id: Date.now().toString() + Math.random().toString(36).slice(2, 9),
    nickname,
    inputPlaceName,
    matched: matched || null,
    createdAt: new Date().toISOString(),
    clientIp
  };

  state.submissions.push(submission);

  // 只保留最近 2000 条记录
  if (state.submissions.length > 2000) {
    state.submissions = state.submissions.slice(-2000);
  }

  saveState(state);
  return submission;
}

function litRegion(regionId, nickname, matchedName) {
  const state = loadState();
  if (!regionId) return false;

  const id = String(regionId);
  if (!state.litRegionState[id]) {
    state.litRegionState[id] = {
      count: 0,
      firstLitAt: null,
      lastLitAt: null,
      firstNickname: null,
      matchedName: matchedName || id
    };
  }

  const isFirstTime = !(Number(state.litRegionState[id].count) > 0);
  const now = new Date().toISOString();
  state.litRegionState[id].count = Number(state.litRegionState[id].count || 0) + 1;
  state.litRegionState[id].lastLitAt = now;
  state.litRegionState[id].matchedName = matchedName || state.litRegionState[id].matchedName || id;

  if (isFirstTime) {
    state.litRegionState[id].firstNickname = nickname;
    state.litRegionState[id].firstLitAt = now;
  }

  saveState(state);
  return isFirstTime;
}

function resetState() {
  const next = deepClone(DEFAULT_STATE);
  saveState(next);
  return true;
}

function getStats(lookupRegionMeta) {
  const state = loadState();

  const litEntries = Object.entries(state.litRegionState || {}).filter(([, v]) => Number(v?.count || 0) > 0);
  const litRegions = litEntries.map(([id, v]) => {
    const meta = typeof lookupRegionMeta === 'function' ? lookupRegionMeta(id) : null;
    return {
      id,
      name: v?.matchedName || meta?.name || id,
      level: meta?.level || null,
      centroid: meta?.centroid || meta?.center || null,
      count: Number(v?.count || 0),
      firstLitAt: v?.firstLitAt || null,
      lastLitAt: v?.lastLitAt || null,
      firstNickname: v?.firstNickname || null,
    };
  });

  // 大屏 header 仍显示“已点亮省份数”：按 adcode 规则粗略判断省级（xxxx00/xxxxxx 不计入）
  const provinceLitCount = litRegions.filter((r) => {
    const s = String(r.id);
    return /^\d{6}$/.test(s) && s.endsWith('0000');
  }).length;

  return {
    litCount: provinceLitCount,
    totalSubmissions: state.submissions.length,
    litRegions
  };
}

function getHistory(limit = 50) {
  const state = loadState();
  const l = Math.max(1, Math.min(500, Number(limit) || 50));
  return state.submissions.slice(-l);
}

module.exports = {
  PROVINCES,
  loadState,
  saveState,
  getState,
  setState,
  addSubmission,
  litRegion,
  resetState,
  getStats,
  getHistory
};
