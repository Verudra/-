#!/usr/bin/env node

/**
 * 完整功能测试脚本
 * 用法: node test-api.js
 */

const http = require('http');
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m'
};

function log(type, message) {
  const prefix = {
    success: `${colors.green}✅${colors.reset}`,
    error: `${colors.red}❌${colors.reset}`,
    info: `${colors.blue}ℹ️${colors.reset}`,
    warn: `${colors.yellow}⚠️${colors.reset}`
  }[type] || '';
  
  console.log(`${prefix} ${message}`);
}

function formatBodyForError(body) {
  try {
    if (typeof body === 'string') return body.slice(0, 300);
    return JSON.stringify(body).slice(0, 300);
  } catch {
    return String(body);
  }
}

function failWithResponse(label, res) {
  const status = res?.status;
  const body = formatBodyForError(res?.body);
  return new Error(`${label} 失败: status=${status} body=${body}`);
}

// 发送 HTTP 请求
function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body: body });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

// 测试套件
const tests = [
  {
    name: '1. 健康检查',
    fn: async () => {
      const res = await makeRequest('GET', '/health');
      if (res.status === 200 && res.body.status === 'ok') {
        log('success', '服务器运行正常');
        return true;
      }
      throw new Error(`Status ${res.status}`);
    }
  },
  {
    name: '2. 获取点亮状态',
    fn: async () => {
      const res = await makeRequest('GET', '/api/lit/state');
      if (res.status === 200 && res.body.ok) {
        log('success', `已点亮: ${res.body.litCount}, 参与人次: ${res.body.totalSubmissions}`);
        return true;
      }
      throw new Error(`Status ${res.status}`);
    }
  },
  {
    name: '3. 提交点亮请求(地名输入)',
    fn: async () => {
      const res = await makeRequest('POST', '/api/lights', {
        nickname: '测试用户1',
        placeName: '北京市'
      });
      if (res.status === 200 && res.body.ok && res.body.matched) {
        log('success', `提交成功 - ${res.body.matched.name}`);
        return true;
      }
      throw new Error(`Status ${res.status}: ${res.body.message || 'unknown'}`);
    }
  },
  {
    name: '4. 提交重复点亮(同地名)',
    fn: async () => {
      const res = await makeRequest('POST', '/api/lights', {
        nickname: '测试用户2',
        placeName: '北京市'
      });
      if (res.status === 200 && res.body.ok) {
        log('success', '重复点亮同一地区 - OK');
        return true;
      }
      throw new Error(`Status ${res.status}`);
    }
  },
  {
    name: '5. 验证统计更新',
    fn: async () => {
      const res = await makeRequest('GET', '/api/lit/state');
      if (res.status === 200 && res.body.ok && res.body.totalSubmissions >= 2) {
        log('success', `统计已更新 - 参与人次: ${res.body.totalSubmissions}`);
        return true;
      }
      throw new Error(`Status ${res.status}`);
    }
  },
  {
    name: '6. 获取二维码',
    fn: async () => {
      const res = await makeRequest('GET', '/api/qrcode');
      if (res.status === 200 && res.body.ok && res.body.qrCode && res.body.url) {
        log('success', `二维码已生成 - ${res.body.url.substring(0, 40)}...`);
        return true;
      }
      throw new Error(`Status ${res.status}`);
    }
  },
  {
    name: '7. 获取历史提交记录',
    fn: async () => {
      const res = await makeRequest('GET', '/api/history?limit=10');
      if (res.status === 200 && res.body.ok && Array.isArray(res.body.data)) {
        log('success', `获取 ${res.body.data.length} 条提交记录`);
        return true;
      }
      throw failWithResponse('获取历史提交记录', res);
    }
  },
  {
    name: '8. 测试错误口令重置',
    fn: async () => {
      const res = await makeRequest('POST', '/api/admin/reset', {
        password: 'wrong_password'
      });
      if (res.status === 403 && !res.body.ok) {
        log('success', '错误口令被拒绝 - 安全验证 OK');
        return true;
      }
      throw new Error(`Expected 403, got ${res.status}`);
    }
  },
  {
    name: '9. 提交不同地区',
    fn: async () => {
      const res = await makeRequest('POST', '/api/lights', {
        nickname: '测试用户3',
        placeName: '上海市'
      });
      if (res.status === 200 && res.body.ok && res.body.matched) {
        log('success', `新地区点亮 - ${res.body.matched.name}`);
        return true;
      }
      throw new Error(`Status ${res.status}`);
    }
  },
  {
    name: '10. 验证点亮状态',
    fn: async () => {
      const res = await makeRequest('GET', '/api/lit/state');
      if (res.status === 200 && res.body.ok && res.body.litCount >= 2) {
        log('success', `已点亮地区数: ${res.body.litCount}`);
        return true;
      }
      throw new Error(`Status ${res.status}`);
    }
  },
  {
    name: '11. 正确口令重置',
    fn: async () => {
      const res = await makeRequest('POST', '/api/admin/reset', {
        password: '2025'
      });
      if (res.status === 200 && res.body.ok) {
        log('success', '地图已重置');
        return true;
      }
      throw new Error(`Status ${res.status}: ${res.body.message}`);
    }
  },
  {
    name: '12. 验证重置效果',
    fn: async () => {
      const res = await makeRequest('GET', '/api/lit/state');
      if (res.status === 200 && res.body.ok && res.body.litCount === 0) {
        log('success', '地图已清空 - 重置成功');
        return true;
      }
      throw failWithResponse('验证重置效果', res);
    }
  }
];

// 运行测试
async function runTests() {
  console.log('\n' + '='.repeat(50));
  console.log('🧪 开始测试 MPIT 项目 API');
  console.log('='.repeat(50) + '\n');

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      log('info', `测试中... ${test.name}`);
      await test.fn();
      passed++;
    } catch (error) {
      const msg = error && typeof error.message === 'string' && error.message.length > 0 ? error.message : String(error);
      log('error', `${test.name} - ${msg}`);
      failed++;
    }
    
    // 延迟以避免限流
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log('\n' + '='.repeat(50));
  console.log(`📊 测试结果: ${colors.green}${passed} 通过${colors.reset} / ${colors.red}${failed} 失败${colors.reset}`);
  console.log('='.repeat(50) + '\n');

  process.exit(failed > 0 ? 1 : 0);
}

// 启动前检查连接
async function checkServer() {
  try {
    log('info', '正在连接服务器...');
    await makeRequest('GET', '/health');
    log('success', `连接到 ${BASE_URL} 成功\n`);
    return true;
  } catch (error) {
    log('error', `无法连接到 ${BASE_URL}`);
    log('error', '请先启动服务器: npm start');
    process.exit(1);
  }
}

// 主程序
(async () => {
  await checkServer();
  await runTests();
})();
