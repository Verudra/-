const express = require('express');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const compression = require('compression');
const cors = require('cors');
const QRCode = require('qrcode');
const storage = require('./storage');
const { submitRateLimitMiddleware } = require('./rateLimit');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 中间件
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// 全局变量
const connectedClients = new Set();
let appState = storage.getState();

// 日志工具
const logger = {
  info: (msg) => console.log(`ℹ️  ${new Date().toLocaleTimeString()} ${msg}`),
  success: (msg) => console.log(`✅ ${new Date().toLocaleTimeString()} ${msg}`),
  error: (msg) => console.error(`❌ ${new Date().toLocaleTimeString()} ${msg}`),
  warn: (msg) => console.warn(`⚠️  ${new Date().toLocaleTimeString()} ${msg}`)
};

// WebSocket 连接处理
wss.on('connection', (ws) => {
  logger.success('客户端已连接（大屏）');
  connectedClients.add(ws);

  const stats = storage.getStats();

  // 向新连接的客户端发送当前状态
  ws.send(JSON.stringify({
    type: 'initial_state',
    data: {
      provinces: stats.provinces,
      litState: appState.provinceLitState,
      totalSubmissions: appState.submissions.length,
      stats: {
        ...stats,
        clientsConnected: connectedClients.size
      }
    }
  }));

  ws.on('close', () => {
    logger.warn('客户端已断开连接（大屏）');
    connectedClients.delete(ws);
  });

  ws.on('error', (error) => {
    logger.error(`WebSocket 错误: ${error.message}`);
  });
});

// 广播消息给所有连接的客户端
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

// API: 获取所有省份列表
app.get('/api/provinces', (req, res) => {
  res.json(storage.PROVINCES);
});

// API: 获取当前省份点亮状态
app.get('/api/provinces/state', (req, res) => {
  const stats = storage.getStats();
  res.json({
    provinces: stats.provinces,
    totalLit: stats.litCount,
    totalSubmissions: stats.totalSubmissions
  });
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
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    
    res.json({
      ok: true,
      qrCode,
      url
    });
  } catch (error) {
    logger.error(`生成二维码失败: ${error.message}`);
    res.status(500).json({
      ok: false,
      message: '生成二维码失败'
    });
  }
});

// API: 提交点亮记录
app.post('/api/submissions', submitRateLimitMiddleware, (req, res) => {
  const { nickname, provinceId } = req.body;
  const clientIp = req.ip || req.connection.remoteAddress;

  // 验证昵称
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

  // 验证省份
  const province = storage.PROVINCES.find(p => p.id === provinceId);
  if (!province) {
    return res.status(400).json({ ok: false, message: '省份不存在' });
  }

  try {
    // 保存提交记录
    const submission = storage.addSubmission(cleanNickname, provinceId, clientIp);
    appState = storage.getState();

    // 点亮省份
    const isFirstTime = storage.litProvince(provinceId, cleanNickname);
    appState = storage.getState();

    // 广播给所有大屏客户端
    const clientCount = broadcastToClients({
      type: 'province_lit',
      data: {
        provinceId,
        provinceName: province.name,
        nickname: cleanNickname,
        isFirstTime,
        timestamp: new Date().toISOString(),
        stats: {
          ...storage.getStats(),
          clientsConnected: connectedClients.size
        }
      }
    });

    logger.success(`${cleanNickname} 点亮了 ${province.name} (${clientCount} 个大屏已同步)`);

    res.json({
      ok: true,
      message: '提交成功',
      lit: true,
      provinceName: province.name,
      stats: storage.getStats()
    });
  } catch (error) {
    logger.error(`提交处理失败: ${error.message}`);
    res.status(500).json({
      ok: false,
      message: '服务器错误，请稍后重试'
    });
  }
});

// API: 获取实时统计
app.get('/api/stats', (req, res) => {
  const stats = storage.getStats();
  res.json({
    ok: true,
    ...stats,
    clientsConnected: connectedClients.size
  });
});

// API: 管理员重置（简单口令保护）
app.post('/api/admin/reset', (req, res) => {
  const { password } = req.body;

  // 简单口令（生产环境应该用环境变量）
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '2025';
  if (password !== ADMIN_PASSWORD) {
    logger.warn('重置失败：口令错误');
    return res.status(403).json({ ok: false, message: '口令错误' });
  }

  try {
    storage.resetState();
    appState = storage.getState();

    // 广播重置事件
    broadcastToClients({
      type: 'reset',
      data: {
        timestamp: new Date().toISOString()
      }
    });

    logger.success('地图已重置');
    res.json({ ok: true, message: '已重置' });
  } catch (error) {
    logger.error(`重置失败: ${error.message}`);
    res.status(500).json({
      ok: false,
      message: '重置失败'
    });
  }
});

// API: 获取所有提交记录（仅用于测试/统计）
app.get('/api/submissions', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const submissions = appState.submissions.slice(-limit);
  res.json({
    ok: true,
    total: appState.submissions.length,
    data: submissions
  });
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    connectedClients: connectedClients.size
  });
});

// 404 处理
app.use((req, res) => {
  res.status(404).json({ message: 'Not Found' });
});

// 错误处理
app.use((err, req, res, next) => {
  logger.error(`未处理的错误: ${err.message}`);
  res.status(500).json({
    ok: false,
    message: '服务器错误'
  });
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  logger.success(`🚀 服务器启动在 http://localhost:${PORT}`);
  logger.info(`📱 手机端: http://localhost:${PORT}/mobile.html`);
  logger.info(`🖥️  大屏端: http://localhost:${PORT}/display.html`);
  logger.info(`❤️  健康检查: http://localhost:${PORT}/health`);
});

// 优雅关闭
process.on('SIGTERM', () => {
  logger.warn('收到 SIGTERM 信号，开始关闭服务器...');
  server.close(() => {
    logger.success('服务器已关闭');
    process.exit(0);
  });
});

module.exports = app;
