// IP 限流
const rateLimits = new Map();

// 配置
const CONFIG = {
  windowMs: 60 * 1000,        // 时间窗口（毫秒）：60 秒
  maxRequests: 30,            // 每个时间窗口最多请求数
  submitWindowMs: 5 * 1000,   // 提交专用窗口：5秒
  submitMaxRequests: 5        // 5秒内最多提交次数
};

function getIp(req) {
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

// 检查是否超过限流
function isRateLimited(ip, key = 'default') {
  const now = Date.now();
  const limitKey = `${ip}:${key}`;

  const windowMs = key === 'submit' ? CONFIG.submitWindowMs : CONFIG.windowMs;
  const maxRequests = key === 'submit' ? CONFIG.submitMaxRequests : CONFIG.maxRequests;

  const existing = rateLimits.get(limitKey);
  if (!existing || now > existing.resetTime) {
    rateLimits.set(limitKey, { count: 1, resetTime: now + windowMs });
    return false;
  }

  if (existing.count >= maxRequests) return true;
  existing.count++;
  return false;
}

function rateLimitMiddleware(req, res, next) {
  const ip = getIp(req);
  if (isRateLimited(ip)) {
    return res.status(429).json({ ok: false, message: '请求过于频繁，请稍候再试' });
  }
  next();
}

function submitRateLimitMiddleware(req, res, next) {
  const ip = getIp(req);
  if (isRateLimited(ip, 'submit')) {
    return res.status(429).json({ ok: false, message: '提交过于频繁，请稍后再试' });
  }
  next();
}

// 清理过期记录（每分钟执行一次）
setInterval(() => {
  const now = Date.now();
  for (const [key, limit] of rateLimits.entries()) {
    if (now > limit.resetTime + CONFIG.windowMs) {
      rateLimits.delete(key);
    }
  }
}, 60 * 1000);

module.exports = {
  rateLimitMiddleware,
  submitRateLimitMiddleware,
  isRateLimited,
  CONFIG
};
