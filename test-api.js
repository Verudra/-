#!/usr/bin/env node

/**
 * 完整功能测试脚本
 * 用法: node test-api.js
 */

const http = require('http');
const BASE_URL = 'http://localhost:3000';

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
    name: '2. 获取省份列表',
    fn: async () => {
      const res = await makeRequest('GET', '/api/provinces');
      if (res.status === 200 && Array.isArray(res.body) && res.body.length > 0) {
        log('success', `获取了 ${res.body.length} 个省份`);
        return true;
      }
      throw new Error(`Status ${res.status} or invalid format`);
    }
  },
  {
    name: '3. 获取初始状态',
    fn: async () => {
      const res = await makeRequest('GET', '/api/provinces/state');
      if (res.status === 200 && res.body.provinces) {
        log('success', `已点亮: ${res.body.totalLit}, 参与人次: ${res.body.totalSubmissions}`);
        return true;
      }
      throw new Error(`Status ${res.status}`);
    }
  },
  {
    name: '4. 提交点亮请求',
    fn: async () => {
      const res = await makeRequest('POST', '/api/submissions', {
        nickname: '测试用户1',
        provinceId: '11'
      });
      if (res.status === 200 && res.body.ok) {
        log('success', `提交成功 - ${res.body.provinceName}`);
        return true;
      }
      throw new Error(`Status ${res.status}: ${res.body.message}`);
    }
  },
  {
    name: '5. 提交重复点亮',
    fn: async () => {
      const res = await makeRequest('POST', '/api/submissions', {
        nickname: '测试用户2',
        provinceId: '11'
      });
      if (res.status === 200 && res.body.ok) {
        log('success', '重复点亮同一省份 - OK');
        return true;
      }
      throw new Error(`Status ${res.status}`);
    }
  },
  {
    name: '6. 验证统计更新',
    fn: async () => {
      const res = await makeRequest('GET', '/api/stats');
      if (res.status === 200 && res.body.totalSubmissions >= 2) {
        log('success', `统计已更新 - 参与人次: ${res.body.totalSubmissions}`);
        return true;
      }
      throw new Error(`Status ${res.status}`);
    }
  },
  {
    name: '7. 获取二维码',
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
    name: '8. 获取提交记录',
    fn: async () => {
      const res = await makeRequest('GET', '/api/submissions?limit=10');
      if (res.status === 200 && res.body.data && res.body.total >= 2) {
        log('success', `获取 ${res.body.data.length} 条提交记录`);
        return true;
      }
      throw new Error(`Status ${res.status}`);
    }
  },
  {
    name: '9. 测试错误口令重置',
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
    name: '10. 提交不同省份',
    fn: async () => {
      const res = await makeRequest('POST', '/api/submissions', {
        nickname: '测试用户3',
        provinceId: '31'
      });
      if (res.status === 200 && res.body.ok) {
        log('success', `新省份点亮 - ${res.body.provinceName}`);
        return true;
      }
      throw new Error(`Status ${res.status}`);
    }
  },
  {
    name: '11. 验证省份点亮状态',
    fn: async () => {
      const res = await makeRequest('GET', '/api/provinces/state');
      if (res.status === 200 && res.body.totalLit >= 2) {
        log('success', `已点亮省份数: ${res.body.totalLit}`);
        return true;
      }
      throw new Error(`Status ${res.status}`);
    }
  },
  {
    name: '12. 正确口令重置',
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
    name: '13. 验证重置效果',
    fn: async () => {
      const res = await makeRequest('GET', '/api/provinces/state');
      if (res.status === 200 && res.body.totalLit === 0) {
        log('success', '地图已清空 - 重置成功');
        return true;
      }
      throw new Error(`重置失败: totalLit = ${res.body.totalLit}`);
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
      log('error', `${test.name} - ${error.message}`);
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
