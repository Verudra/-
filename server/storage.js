const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 默认状态
const DEFAULT_STATE = {
  provinceLitState: {},
  submissions: [],
  lastUpdated: new Date().toISOString()
};

// 初始化省份
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

// 初始化默认状态
function initializeDefaultState() {
  const provinceLitState = {};
  PROVINCES.forEach(p => {
    provinceLitState[p.id] = { isLit: false, litAt: null, firstNickname: null };
  });
  DEFAULT_STATE.provinceLitState = provinceLitState;
}

initializeDefaultState();

// 读取状态
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('❌ 读取状态文件失败:', err.message);
  }
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

// 保存状态
function saveState(state) {
  try {
    state.lastUpdated = new Date().toISOString();
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('❌ 保存状态文件失败:', err.message);
    return false;
  }
}

// 获取当前状态
function getState() {
  return loadState();
}

// 更新状态
function setState(newState) {
  return saveState(newState);
}

// 添加提交记录
function addSubmission(nickname, provinceId, clientIp) {
  const state = loadState();
  const submission = {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
    nickname,
    provinceId,
    createdAt: new Date().toISOString(),
    clientIp
  };
  state.submissions.push(submission);
  
  // 只保留最近 1000 条记录
  if (state.submissions.length > 1000) {
    state.submissions = state.submissions.slice(-1000);
  }
  
  saveState(state);
  return submission;
}

// 点亮省份
function litProvince(provinceId, nickname) {
  const state = loadState();
  if (!state.provinceLitState[provinceId]) {
    return false;
  }
  
  const isFirstTime = !state.provinceLitState[provinceId].isLit;
  if (isFirstTime) {
    state.provinceLitState[provinceId].isLit = true;
    state.provinceLitState[provinceId].litAt = new Date().toISOString();
    state.provinceLitState[provinceId].firstNickname = nickname;
  }
  
  saveState(state);
  return isFirstTime;
}

// 重置状态
function resetState() {
  const state = JSON.parse(JSON.stringify(DEFAULT_STATE));
  saveState(state);
  return true;
}

// 获取统计信息
function getStats() {
  const state = loadState();
  const litCount = Object.values(state.provinceLitState).filter(p => p.isLit).length;
  const totalSubmissions = state.submissions.length;

  const submissionCountByProvinceId = {};
  for (const s of state.submissions) {
    if (!s || !s.provinceId) continue;
    submissionCountByProvinceId[s.provinceId] = (submissionCountByProvinceId[s.provinceId] || 0) + 1;
  }
  
  return {
    litCount,
    totalSubmissions,
    provinces: PROVINCES.map(p => ({
      ...p,
      ...state.provinceLitState[p.id],
      submissionCount: submissionCountByProvinceId[p.id] || 0
    }))
  };
}

module.exports = {
  PROVINCES,
  loadState,
  saveState,
  getState,
  setState,
  addSubmission,
  litProvince,
  resetState,
  getStats
};
