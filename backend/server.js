const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const compression = require('compression');
const cors = require('cors');
const QRCode = require('qrcode');

const storage = require('./storage');
const { submitRateLimitMiddleware } = require('./rateLimit');
const { createGeoIndex } = require('./geoIndex');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const geoIndex = createGeoIndex();

// 缓存：全国市级/区县级合并 GeoJSON（按需生成，避免启动时阻塞）
let cachedAllCitiesGeoJson = null;
let cachedAllDistrictsGeoJson = null;

function mergeGeoJsonFromDir(dirPath) {
  const out = { type: 'FeatureCollection', features: [] };
  let files;
  try {
    files = fs.readdirSync(dirPath).filter((f) => f.endsWith('_full.json'));
  } catch (_) {
    return out;
  }

  for (const fileName of files) {
    const fp = path.join(dirPath, fileName);
    try {
      const raw = fs.readFileSync(fp, 'utf8');
      const j = JSON.parse(raw);
      if (Array.isArray(j?.features) && j.features.length > 0) {
        out.features.push(...j.features);
      }
    } catch (e) {
      logger.warn(`合并 GeoJSON 跳过文件失败: ${fileName} (${e.message})`);
    }
  }

  return out;
}

// 中间件
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// 前端静态资源（仍放在 public/，但后端代码已独立到 backend/）
app.use(express.static(path.join(__dirname, '../public')));

// 全局变量
const connectedClients = new Set();

// 日志工具
const logger = {
  info: (msg) => console.log(`ℹ️  ${new Date().toLocaleTimeString()} ${msg}`),
  success: (msg) => console.log(`✅ ${new Date().toLocaleTimeString()} ${msg}`),
  error: (msg) => console.error(`❌ ${new Date().toLocaleTimeString()} ${msg}`),
  warn: (msg) => console.warn(`⚠️  ${new Date().toLocaleTimeString()} ${msg}`)
};

function broadcastToClients(message) {
  const messageStr = JSON.stringify(message);
  let successCount = 0;

  connectedClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
      successCount++;
    }
  });

  return successCount;
}

function currentStats() {
  return storage.getStats((id) => geoIndex.lookupRegionMeta(id));
}

function inferLevelFromAdcode(id) {
  const s = String(id || '').trim();
  if (!/^\d{6}$/.test(s)) return null;
  if (s.endsWith('0000')) return 'province';
  if (s.endsWith('00')) return 'city';
  return 'district';
}

function buildLitCascadeIds(matchedId) {
  const s = String(matchedId || '').trim();
  if (!/^\d{6}$/.test(s)) return [String(matchedId || '').trim()].filter(Boolean);

  const out = [];
  const level = inferLevelFromAdcode(s);
  if (level === 'province') {
    out.push(s);
  } else if (level === 'city') {
    out.push(s.slice(0, 2) + '0000');
    out.push(s);
  } else {
    out.push(s.slice(0, 2) + '0000');
    out.push(s.slice(0, 4) + '00');
    out.push(s);
  }

  return Array.from(new Set(out));
}

function makeInitialPayload() {
  const stats = currentStats();
  const history = storage.getHistory(50);
  return {
    type: 'initial_state',
    data: {
      stats: {
        ...stats,
        clientsConnected: connectedClients.size,
        geo: geoIndex.getMeta()
      },
      history
    }
  };
}

// WebSocket 连接处理（大屏）
wss.on('connection', (ws) => {
  logger.success('客户端已连接（大屏）');
  connectedClients.add(ws);

  ws.send(JSON.stringify(makeInitialPayload()));

  ws.on('close', () => {
    logger.warn('客户端已断开连接（大屏）');
    connectedClients.delete(ws);
  });

  ws.on('error', (error) => {
    logger.error(`WebSocket 错误: ${error.message}`);
  });
});

// API: GeoJSON（大屏使用；县级数据可能很大，建议走本地）
app.get('/api/geo/china', (req, res) => {
  // 大屏底图只需要省级边界（更轻、更稳定）；精细匹配仍由 geoIndex 内部县级索引负责。
  const fp = path.join(__dirname, '../public/vendor/echarts/map/json/china.json');
  try {
    const raw = fs.readFileSync(fp, 'utf8');
    res.set('Cache-Control', 'public, max-age=86400');
    res.type('json').send(raw);
  } catch (e) {
    // 兜底：若文件读取失败，仍返回索引内 GeoJSON（可能很大）
    logger.warn(`读取省级底图失败，回退到索引 GeoJSON: ${e.message}`);
    res.json(geoIndex.getGeoJson());
  }
});

// API: Geo 元信息
app.get('/api/geo/meta', (req, res) => {
  res.json({ ok: true, ...geoIndex.getMeta() });
});

// API: 获取特定省份的市级地理数据
app.get('/api/geo/province/:provinceCode', (req, res) => {
  const { provinceCode } = req.params;
  const filePath = path.join(__dirname, '../data/geo/provinces', `${provinceCode}_full.json`);

  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      const geojson = JSON.parse(data);
      res.json(geojson);
    } else {
      // 如果省份文件不存在，返回空数据
      res.json({ type: 'FeatureCollection', features: [] });
    }
  } catch (error) {
    logger.warn(`读取省份 ${provinceCode} 地图数据失败（返回空数据）: ${error.message}`);
    res.json({ type: 'FeatureCollection', features: [] });
  }
});

// API: 获取特定城市的区县级地理数据
app.get('/api/geo/city/:cityCode', (req, res) => {
  const { cityCode } = req.params;
  const filePath = path.join(__dirname, '../data/geo/cities', `${cityCode}_full.json`);

  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      const geojson = JSON.parse(data);
      res.json(geojson);
    } else {
      // 如果城市文件不存在，返回空数据
      res.json({ type: 'FeatureCollection', features: [] });
    }
  } catch (error) {
    logger.warn(`读取城市 ${cityCode} 地图数据失败（返回空数据）: ${error.message}`);
    res.json({ type: 'FeatureCollection', features: [] });
  }
});

// API: 全国市级边界（合并所有省份 *_full.json）
app.get('/api/geo/cities/all', (req, res) => {
  try {
    if (!cachedAllCitiesGeoJson) {
      const dirPath = path.join(__dirname, '../data/geo/provinces');
      cachedAllCitiesGeoJson = mergeGeoJsonFromDir(dirPath);
      logger.success(`已生成全国市级 GeoJSON：features=${cachedAllCitiesGeoJson.features.length}`);
    }
    res.set('Cache-Control', 'public, max-age=86400');
    res.json(cachedAllCitiesGeoJson);
  } catch (e) {
    logger.error(`生成全国市级 GeoJSON 失败: ${e.message}`);
    res.status(500).json({ ok: false, message: '生成全国市级地图数据失败' });
  }
});

// API: 全国区县级边界（合并所有城市 *_full.json）
app.get('/api/geo/districts/all', (req, res) => {
  try {
    if (!cachedAllDistrictsGeoJson) {
      const dirPath = path.join(__dirname, '../data/geo/cities');
      cachedAllDistrictsGeoJson = mergeGeoJsonFromDir(dirPath);
      logger.success(`已生成全国区县级 GeoJSON：features=${cachedAllDistrictsGeoJson.features.length}`);
    }
    res.set('Cache-Control', 'public, max-age=86400');
    res.json(cachedAllDistrictsGeoJson);
  } catch (e) {
    logger.error(`生成全国区县级 GeoJSON 失败: ${e.message}`);
    res.status(500).json({ ok: false, message: '生成全国区县级地图数据失败' });
  }
});


// 新 API: 点亮（输入地区全名，后端自动匹配）
app.post('/api/lights', submitRateLimitMiddleware, (req, res) => {
  const { nickname, placeName } = req.body;
  const clientIp = req.ip || req.connection?.remoteAddress;

  if (!nickname || typeof nickname !== 'string') {
    return res.status(400).json({ ok: false, message: '昵称参数无效' });
  }
  const cleanNickname = nickname.trim();
  if (cleanNickname.length === 0) {
    return res.status(400).json({ ok: false, message: '昵称不能为空' });
  }
  if (cleanNickname.length > 20) {
    return res.status(400).json({ ok: false, message: '昵称太长，最多20个字符' });
  }

  if (!placeName || typeof placeName !== 'string') {
    return res.status(400).json({ ok: false, message: '地区名称参数无效' });
  }

  const cleanPlaceName = String(placeName).trim();
  const match = geoIndex.matchPlaceName(cleanPlaceName);

  try {
    // 即使匹配失败，也记录用户输入（用于右侧滚动记录展示）
    if (!match.ok || !match.matched) {
      const submission = storage.addSubmission(cleanNickname, cleanPlaceName, null, clientIp);

      broadcastToClients({
        type: 'submission',
        data: {
          nickname: cleanNickname,
          inputPlaceName: cleanPlaceName,
          matched: null,
          createdAt: submission.createdAt,
          stats: {
            ...currentStats(),
            clientsConnected: connectedClients.size,
            geo: geoIndex.getMeta()
          }
        }
      });

      return res.json({
        ok: true,
        lit: false,
        message: match.message || '未能匹配到地名，已记录输入',
        matched: null,
        alternatives: [],
        stats: currentStats()
      });
    }

    const matched = match.matched;

    // 记录提交（保存最精确的匹配）
    storage.addSubmission(cleanNickname, cleanPlaceName, matched, clientIp);

    // 点亮：匹配到区县时，同时累计省/市/区县；匹配到市则累计省/市
    const cascadeIds = buildLitCascadeIds(matched.id);
    let isFirstTime = false;
    for (const id of cascadeIds) {
      const meta = geoIndex.lookupRegionMeta(id);
      const name = meta?.name || (String(id) === String(matched.id) ? matched.name : String(id));
      const first = storage.litRegion(id, cleanNickname, name);
      if (String(id) === String(matched.id)) isFirstTime = first;
    }

    const stats = currentStats();

    // 广播给所有大屏客户端
    const clientCount = broadcastToClients({
      type: 'region_lit',
      data: {
        regionId: matched.id,
        regionName: matched.name,
        inputPlaceName: cleanPlaceName,
        nickname: cleanNickname,
        isFirstTime,
        timestamp: new Date().toISOString(),
        matched,
        cascadeIds,
        stats: {
          ...stats,
          clientsConnected: connectedClients.size,
          geo: geoIndex.getMeta()
        }
      }
    });

    logger.success(`${cleanNickname} 点亮了 ${matched.name} (${clientCount} 个大屏已同步)`);

    res.json({
      ok: true,
      message: '提交成功',
      lit: true,
      matched,
      alternatives: match.alternatives || [],
      isFirstTime,
      stats
    });
  } catch (error) {
    logger.error(`提交处理失败: ${error.message}`);
    res.status(500).json({ ok: false, message: '服务器错误，请稍后重试' });
  }
});

// 新 API: 获取点亮状态
app.get('/api/lit/state', (req, res) => {
  const stats = currentStats();
  res.json({ ok: true, ...stats });
});

// 新 API: 历史提交（滚动展示用）
app.get('/api/history', (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 50;
  const data = storage.getHistory(limit);
  res.json({ ok: true, total: storage.getState().submissions.length, data });
});

// API: 获取二维码
app.get('/api/qrcode', async (req, res) => {
  try {
    const url = `${req.protocol}://${req.get('host')}/mobile.html`;
    const qrCode = await QRCode.toDataURL(url, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      width: 150,
      margin: 1,
      color: { dark: '#000000', light: '#FFFFFF' }
    });

    res.json({ ok: true, qrCode, url });
  } catch (error) {
    logger.error(`生成二维码失败: ${error.message}`);
    res.status(500).json({ ok: false, message: '生成二维码失败' });
  }
});

// API: 管理员重置（简单口令保护）
app.post('/api/admin/reset', (req, res) => {
  const { password } = req.body;
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '2025';
  if (password !== ADMIN_PASSWORD) {
    logger.warn('重置失败：口令错误');
    return res.status(403).json({ ok: false, message: '口令错误' });
  }

  try {
    storage.resetState();

    broadcastToClients({
      type: 'reset',
      data: { timestamp: new Date().toISOString() }
    });

    logger.success('地图已重置');
    res.json({ ok: true, message: '已重置' });
  } catch (error) {
    logger.error(`重置失败: ${error.message}`);
    res.status(500).json({ ok: false, message: '重置失败' });
  }
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    connectedClients: connectedClients.size,
    geo: geoIndex.getMeta()
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({ message: 'Not Found' });
});

const PORT = process.env.PORT || 3000;
server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    logger.error(`端口 ${PORT} 已被占用（EADDRINUSE），请先关闭占用该端口的进程，或设置 PORT 环境变量后重试`);
    logger.info('Windows 示例：netstat -ano | findstr ":3000"  查看 PID，然后 taskkill /PID <pid> /F');
    process.exit(1);
  }
  logger.error(`服务器启动失败: ${err?.message || String(err)}`);
  process.exit(1);
});
server.listen(PORT, () => {
  logger.success(`服务器已启动: http://localhost:${PORT}`);
  logger.info(`Geo 数据: ${geoIndex.getMeta().source}`);
});
