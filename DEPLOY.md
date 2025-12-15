# 快速启动指南

## 环境要求
- Node.js 14+
- npm 或 yarn

## 一、本地安装与启动

### 1. 安装依赖

```bash
npm install
```

### 2. 启动服务

#### 开发模式（自动重启）
```bash
npm run dev
```

#### 生产模式
```bash
npm start
```

服务器将在 `http://localhost:3000` 启动（或 `http://0.0.0.0:3000`）

## 二、访问应用

### 大屏展示端（推荐全屏打开）
打开浏览器访问：http://localhost:3000/display.html
- 显示中国地图
- 实时点亮已参与的省份
- 显示统计数据
- 生成二维码供手机扫描
- 支持重置和导出数据

### 手机参与端
打开浏览器访问：http://localhost:3000/mobile.html
- 输入昵称
- 选择省份
- 提交参与

或在大屏端扫描显示的二维码

## 三、功能说明

### 大屏端特性
✅ 实时中国地图显示  
✅ 已点亮省份标记与涟漪动画  
✅ 已点亮省份列表显示  
✅ 统计数据实时更新（点亮数、参与人次、在线大屏数）  
✅ 生成二维码 URL（本地生成）  
✅ 导出参与数据为 JSON  
✅ 管理员重置功能（密码保护）  

### 手机端特性
✅ 简洁的参与表单  
✅ 昵称字符计数提示  
✅ 省份下拉列表选择  
✅ 防重复提交保护  
✅ 限流防刷（5秒内最多提交3次）  
✅ 提交成功动画反馈  
✅ 自动表单重置  

## 四、API 接口

### 获取省份列表
```bash
GET /api/provinces

Response:
[
  { "id": "11", "name": "北京市" },
  ...
]
```

### 获取当前点亮状态
```bash
GET /api/provinces/state

Response:
{
  "provinces": [
    {
      "id": "11",
      "name": "北京市",
      "isLit": true,
      "litAt": "2025-12-16T00:30:00.000Z",
      "firstNickname": "小明"
    }
  ],
  "totalLit": 5,
  "totalSubmissions": 8
}
```

### 提交点亮
```bash
POST /api/submissions
Content-Type: application/json

Request:
{
  "nickname": "小明",
  "provinceId": "11"
}

Response:
{
  "ok": true,
  "message": "提交成功",
  "lit": true,
  "provinceName": "北京市",
  "stats": {
    "litCount": 5,
    "totalSubmissions": 8,
    "clientsConnected": 1
  }
}
```

### 获取二维码
```bash
GET /api/qrcode

Response:
{
  "ok": true,
  "qrCode": "data:image/png;base64,...",
  "url": "http://localhost:3000/mobile.html"
}
```

### 获取统计信息
```bash
GET /api/stats

Response:
{
  "ok": true,
  "litCount": 5,
  "totalSubmissions": 8,
  "clientsConnected": 1,
  "provinces": [...]
}
```

### 重置地图（管理员）
```bash
POST /api/admin/reset
Content-Type: application/json

Request:
{
  "password": "2025"  // 默认密码，可通过环境变量修改
}

Response:
{
  "ok": true,
  "message": "已重置"
}
```

### 获取提交记录
```bash
GET /api/submissions?limit=100

Response:
{
  "ok": true,
  "total": 8,
  "data": [
    {
      "id": "1702675200000abc123",
      "nickname": "小明",
      "provinceId": "11",
      "createdAt": "2025-12-16T00:30:00.000Z",
      "clientIp": "127.0.0.1"
    }
  ]
}
```

### 健康检查
```bash
GET /health

Response:
{
  "status": "ok",
  "timestamp": "2025-12-16T00:30:00.000Z",
  "uptime": 123.456,
  "connectedClients": 1
}
```

## 五、配置说明

### 环境变量
- `PORT`: 服务端口（默认 3000）
- `HOST`: 绑定地址（默认 0.0.0.0）
- `ADMIN_PASSWORD`: 管理员重置密码（默认 "2025"）

#### 使用示例
```bash
# Linux/Mac
PORT=8080 ADMIN_PASSWORD=MySecret npm start

# Windows (PowerShell)
$env:PORT = 8080; npm start
```

### 修改重置密码
在启动时通过环境变量设置：
```bash
ADMIN_PASSWORD=你的新密码 npm start
```

## 六、数据持久化

- 所有提交记录和点亮状态保存在 `data/state.json`
- 重启服务器后数据自动恢复
- 支持手动导出 JSON 数据（大屏端的"导出数据"按钮）

## 七、部署到服务器

### 方式一：直接运行（适合测试）
```bash
# 在服务器上克隆代码
git clone <你的仓库>
cd MpItProject

# 安装依赖
npm install

# 启动（生产模式）
PORT=3000 npm start
```

### 方式二：使用 PM2（推荐生产环境）
```bash
# 全局安装 PM2
npm install -g pm2

# 启动服务
pm2 start server/server.js --name "mpit-project"

# 查看运行状态
pm2 status

# 查看日志
pm2 logs mpit-project

# 设置开机自启
pm2 startup
pm2 save

# 重启服务
pm2 restart mpit-project

# 停止服务
pm2 stop mpit-project
```

### 方式三：使用 Docker（最简洁）
创建 `Dockerfile`：
```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3000
ENV PORT=3000
CMD ["npm", "start"]
```

构建并运行：
```bash
# 构建镜像
docker build -t mpit-project .

# 运行容器
docker run -p 3000:3000 -e ADMIN_PASSWORD="你的密码" mpit-project

# 挂载数据目录（持久化）
docker run -p 3000:3000 -v $(pwd)/data:/app/data mpit-project
```

### 方式四：使用 nginx 反向代理

编辑 nginx 配置（`/etc/nginx/sites-available/default`）：
```nginx
upstream mpit_backend {
    server 127.0.0.1:3000;
}

server {
    listen 80;
    server_name your-domain.com;

    # 大屏展示端
    location /display.html {
        proxy_pass http://mpit_backend;
    }

    # 手机参与端
    location /mobile.html {
        proxy_pass http://mpit_backend;
    }

    # WebSocket
    location / {
        proxy_pass http://mpit_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 八、故障排除

### 端口已被占用
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Mac/Linux
lsof -i :3000
kill -9 <PID>
```

### WebSocket 连接失败
- 确保大屏和手机在同一局域网或能互相访问
- 检查防火墙是否阻止了 WebSocket (ws://)
- 查看浏览器控制台的错误信息

### 大屏地图不显示
- 确保浏览器支持 WebSocket（所有现代浏览器都支持）
- 检查网络连接
- 清除浏览器缓存后刷新
- 检查控制台是否有 JavaScript 错误

### 提交后地图没有反应
- 检查大屏是否成功连接到服务器（顶部连接状态）
- 确认网络连接正常
- 查看服务器日志是否有错误

### 限流（5秒内最多提交3次）
- 这是防刷机制，正常用户不会触发
- 等待 5 秒后可重新提交

## 九、本地测试技巧

### 同时打开大屏和手机
1. 在一个浏览器窗口/标签打开 http://localhost:3000/display.html（大屏）
2. 在另一个窗口/标签打开 http://localhost:3000/mobile.html（手机）
3. 在手机端提交，观察大屏实时更新

### 快速测试 API
```bash
# 获取省份列表
curl http://localhost:3000/api/provinces

# 提交点亮
curl -X POST http://localhost:3000/api/submissions \
  -H "Content-Type: application/json" \
  -d '{"nickname":"测试用户","provinceId":"11"}'

# 获取统计
curl http://localhost:3000/api/stats

# 重置地图
curl -X POST http://localhost:3000/api/admin/reset \
  -H "Content-Type: application/json" \
  -d '{"password":"2025"}'

# 导出数据
curl http://localhost:3000/api/submissions?limit=10000 > data.json
```

## 十、性能优化建议

1. **数据库升级**
   - 目前数据存储在内存，建议迁移到 MongoDB 或 PostgreSQL
   - 这样可以支持更大的数据量和多实例部署

2. **缓存**
   - 使用 Redis 缓存频繁查询的数据
   - 减少数据库查询

3. **负载均衡**
   - 如果人数很多，考虑使用多个 Node.js 进程
   - 使用 Nginx/HAProxy 进行反向代理

4. **CDN**
   - 静态资源（display.html, mobile.html, 地图库等）可上传到 CDN 加速

5. **监控**
   - 使用 PM2 的监控功能
   - 添加 APM (Application Performance Monitoring) 工具

## 十一、后续扩展功能

- [ ] 用户账号系统和认证
- [ ] 排行榜功能（最活跃、最早参与等）
- [ ] 数据统计和报表生成
- [ ] 活动主题自定义
- [ ] 分享功能和邀请码
- [ ] 支持多场次活动
- [ ] 微信/支付宝集成
- [ ] 手机端地图选择（替代下拉菜单）

## 十二、许可证
MIT
