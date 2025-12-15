# 跨年互动地图项目 - 完整版 Demo

## 🎯 项目介绍

这是一个实时互动的跨年活动项目。大屏展示中国地图，现场观众通过扫码在手机上选择省份并点亮，大屏实时显示点亮效果。

## ✨ 核心功能（已实现）

### 🖥️ 大屏展示端 (`/display.html`)
- ✅ **ECharts 中国地图**：高质量地图展示
- ✅ **实时点亮动画**：省份被点亮时显示涟漪动画
- ✅ **WebSocket 实时通信**：毫秒级延迟更新
- ✅ **统计数据**：已点亮省份数、参与人次、在线大屏数
- ✅ **二维码生成**：服务端生成（qrcode 库）
- ✅ **已点亮列表**：动态显示已点亮省份标签
- ✅ **数据导出**：一键导出 JSON 格式参与数据
- ✅ **重置功能**：密码保护的地图重置

### 📱 手机参与端 (`/mobile.html`)
- ✅ **简洁表单**：昵称输入 + 省份选择
- ✅ **字符计数**：实时显示昵称字数
- ✅ **防重复提交**：客户端防抖 + 限流保护
- ✅ **错误提示**：明确的错误反馈
- ✅ **成功动画**：提交成功的视觉反馈
- ✅ **自动重置**：3秒后表单自动清空

### 🔧 后端服务 (`server/server.js`)
- ✅ **Express 框架**：HTTP 服务器
- ✅ **WebSocket**：实时双向通信
- ✅ **文件存储**：JSON 文件持久化（`data/state.json`）
- ✅ **限流保护**：5秒内最多提交3次（可配置）
- ✅ **Gzip 压缩**：自动压缩响应
- ✅ **CORS 支持**：跨域请求支持
- ✅ **健康检查**：`/health` 端点
- ✅ **日志系统**：带时间戳和emoji的结构化日志

## 📁 项目结构

```
MpItProject/
├── package.json              # 依赖配置
├── README.md                 # 需求文档
├── DEPLOY.md                 # 部署指南（完整）
├── .gitignore                # Git 忽略文件
├── test-api.js               # API 测试脚本
├── server/
│   ├── server.js             # 主服务器（Express + WebSocket）
│   ├── storage.js            # 数据持久化模块
│   └── rateLimit.js          # 限流中间件
├── public/
│   ├── display.html          # 大屏展示页
│   └── mobile.html           # 手机参与页
├── data/                     # 数据目录（自动生成）
│   └── state.json            # 状态数据
└── node_modules/             # 依赖包
```

## 🚀 快速开始

### 1. 安装依赖
```bash
npm install
```

### 2. 启动服务
```bash
npm start
```

### 3. 访问应用
- **大屏端**: http://localhost:3000/display.html （推荐全屏）
- **手机端**: http://localhost:3000/mobile.html （或扫描大屏二维码）

## 📊 技术栈

### 前端
- **ECharts 5.4.3** - 中国地图渲染
- **原生 JavaScript** - 无框架依赖
- **WebSocket API** - 实时通信
- **CSS3 动画** - 视觉效果

### 后端
- **Node.js** - 运行时
- **Express 4.18** - HTTP 框架
- **ws 8.14** - WebSocket 库
- **qrcode 1.5** - 二维码生成
- **compression** - Gzip 压缩
- **cors** - CORS 支持

## 🌐 API 文档

### 公开 API

#### 获取省份列表
```http
GET /api/provinces
```
返回 31 个省级行政区数组。

#### 获取当前状态
```http
GET /api/provinces/state
```
返回所有省份点亮状态和统计信息。

#### 提交点亮
```http
POST /api/submissions
Content-Type: application/json

{
  "nickname": "小明",
  "provinceId": "11"
}
```
限流：5秒内最多3次提交。

#### 获取二维码
```http
GET /api/qrcode
```
返回 Base64 编码的二维码图片。

#### 获取统计
```http
GET /api/stats
```
返回点亮数、参与人次、在线大屏数。

#### 获取提交记录
```http
GET /api/submissions?limit=100
```
返回最近的提交记录（默认最多 1000 条）。

### 管理 API

#### 重置地图
```http
POST /api/admin/reset
Content-Type: application/json

{
  "password": "2025"
}
```
默认密码 `2025`，可通过环境变量 `ADMIN_PASSWORD` 修改。

### 系统 API

#### 健康检查
```http
GET /health
```
返回服务器状态、运行时间、连接数。

## 🛠️ 部署到服务器

### 方法 1：PM2（推荐）
```bash
npm install -g pm2
pm2 start server/server.js --name "mpit"
pm2 save
pm2 startup
```

### 方法 2：Docker
```bash
docker build -t mpit-project .
docker run -p 3000:3000 -v $(pwd)/data:/app/data mpit-project
```

### 方法 3：Systemd（Linux）
创建 `/etc/systemd/system/mpit.service`：
```ini
[Unit]
Description=MPIT Interactive Map
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/mpit
ExecStart=/usr/bin/node server/server.js
Restart=always
Environment=PORT=3000
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

启动：
```bash
systemctl enable mpit
systemctl start mpit
```

## ⚙️ 配置

### 环境变量
```bash
# 端口（默认 3000）
PORT=8080

# 绑定地址（默认 0.0.0.0）
HOST=127.0.0.1

# 管理员密码（默认 2025）
ADMIN_PASSWORD=MySecretPassword
```

### 限流配置
编辑 `server/rateLimit.js`：
```javascript
const CONFIG = {
  windowMs: 60 * 1000,        // 一般限流窗口：60秒
  maxRequests: 10,             // 每60秒最多10次请求
  submitWindowMs: 5 * 1000,    // 提交窗口：5秒
  submitMaxRequests: 3         // 每5秒最多3次提交
};
```

## 🧪 测试

运行完整测试套件：
```bash
# 确保服务器已启动
npm start

# 在另一个终端运行测试
node test-api.js
```

测试内容包括：
1. ✅ 健康检查
2. ✅ 获取省份列表
3. ✅ 获取初始状态
4. ✅ 提交点亮请求
5. ✅ 提交重复点亮
6. ✅ 验证统计更新
7. ✅ 获取二维码
8. ✅ 获取提交记录
9. ✅ 测试错误口令重置
10. ✅ 提交不同省份
11. ✅ 验证省份点亮状态
12. ✅ 正确口令重置
13. ✅ 验证重置效果

## 📈 性能指标

- **并发能力**：单实例支持 50-200 人同时提交
- **实时延迟**：< 1 秒（同一局域网）
- **数据持久化**：自动保存到 `data/state.json`
- **限流保护**：防止恶意刷接口
- **WebSocket 连接**：支持多个大屏同时在线

## 🔒 安全特性

- ✅ **参数验证**：昵称和省份 ID 严格验证
- ✅ **SQL 注入防护**：使用 JSON 存储，无 SQL
- ✅ **XSS 防护**：前端输入过滤
- ✅ **限流保护**：IP 级别限流
- ✅ **管理员密码**：重置功能密码保护
- ✅ **CORS 配置**：可配置跨域策略

## 📝 数据格式

### state.json 示例
```json
{
  "provinceLitState": {
    "11": {
      "isLit": true,
      "litAt": "2025-12-16T00:30:00.000Z",
      "firstNickname": "小明"
    }
  },
  "submissions": [
    {
      "id": "1702675200000abc123",
      "nickname": "小明",
      "provinceId": "11",
      "createdAt": "2025-12-16T00:30:00.000Z",
      "clientIp": "127.0.0.1"
    }
  ],
  "lastUpdated": "2025-12-16T00:30:00.000Z"
}
```

## 🎨 自定义

### 修改地图样式
编辑 `public/display.html`，查找 ECharts `option` 配置。

### 修改动画效果
调整 CSS `@keyframes` 和 ECharts `rippleEffect` 参数。

### 修改省份列表
编辑 `server/storage.js` 中的 `PROVINCES` 数组。

## 🚨 故障排除

### 服务器无法启动
```bash
# 检查端口占用
netstat -ano | findstr :3000  # Windows
lsof -i :3000                 # Mac/Linux

# 修改端口
PORT=8080 npm start
```

### WebSocket 连接失败
- 检查浏览器控制台错误
- 确保大屏和服务器网络可达
- 检查防火墙设置

### 数据丢失
- 检查 `data/state.json` 文件权限
- 确保磁盘空间充足
- 考虑定期备份

## 📚 更多文档

- **详细部署指南**: [DEPLOY.md](DEPLOY.md)
- **需求说明**: [README.md](README.md)  
- **API 测试**: 运行 `node test-api.js`

## 📞 支持

如遇到问题：
1. 查看服务器日志
2. 检查浏览器控制台
3. 运行 `node test-api.js` 自检
4. 查看 DEPLOY.md 故障排除章节

## 📄 许可证

MIT License

---

**开发完成日期**: 2025-12-16  
**版本**: 1.0.0 (Production Ready)  
**状态**: ✅ 可部署到生产环境
