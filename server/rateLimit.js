// IP 限流
const rateLimits = new Map();

// 配置
const CONFIG = {
  windowMs: 60 * 1000,        // 时间窗口（毫秒）：60 秒
  maxRequests: 10,             // 每个时间窗口最多请求数
  submitWindowMs: 5 * 1000,    // 提交专用窗口：5秒
  submitMaxRequests: 3         // 5秒内最多提交3次
};

// 检查是否超过限流
function isRateLimited(ip, key = 'default') {
  const now = Date.now();
  const limitKey = `${ip}:${key}`;
  
  if (!rateLimits.has(limitKey)) {
    rateLimits.set(limitKey, { count: 1, resetTime: now + CONFIG.windowMs });
    return false;
  }
  
  const limit = rateLimits.get(limitKey);
  
  // 时间窗口已过期
  if (now > limit.resetTime) {
    rateLimits.set(limitKey, { count: 1, resetTime: now + CONFIG.windowMs });
    return false;
  }
  
  // 检查是否超限
  const window = key === 'submit' ? CONFIG.submitWindowMs : CONFIG.windowMs;
  const maxRequests = key === 'submit' ? CONFIG.submitMaxRequests : CONFIG.maxRequests;
  
  if (limit.count >= maxRequests) {
    return true;
  }
  
  // 增加计数
  limit.count++;
  return false;
}

// Express 中间件
function rateLimitMiddleware(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  
  if (isRateLimited(ip)) {
    return res.status(429).json({
      ok: false,
      message: '请求过于频繁，请稍候再试'
    });
  }
  
  next();
}

// 提交限流中间件
function submitRateLimitMiddleware(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  
  if (isRateLimited(ip, 'submit')) {
    return res.status(429).json({
      ok: false,
      message: '提交过于频繁，请5秒后再试'
    });
  }
  
  next();
}

// 清理过期的限流记录（每分钟执行一次）
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
