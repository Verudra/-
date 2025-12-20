# 跨年互动地图项目（新版：地名输入 / 县区级点亮）

## 你会得到什么

- 大屏端（/display.html）：中国地图面填充点亮 + 新增点亮涟漪 + 点亮历史滚动
- 手机端（/mobile.html）：输入昵称 + 地区全名（自动匹配行政区）
- 后端（backend/server.js）：HTTP API + WebSocket 广播 + data/state.json 持久化

## 快速开始

```bash
npm install
npm start
```

访问：

- http://localhost:3000/display.html
- http://localhost:3000/mobile.html

## 县/区级地图数据（关键）

项目会优先加载县/区级 GeoJSON：

- data/geo/china-county.json

如果文件不存在或解析失败，会自动回退到省级地图（public/vendor/echarts/map/json/china.json）。

判断是否真的“到县”：看 /api/geo/meta 的 featureCount，县区级通常远大于省级。

## API

### 提交点亮（手机端使用）

POST /api/lights

```json
{
  "nickname": "小明",
  "placeName": "广东省深圳市南山区"
}
```

返回：匹配到的行政区 matched，以及备选 alternatives（最多若干条）。

### 当前点亮状态（大屏/运维）

GET /api/lit/state

### 历史记录（大屏滚动/导出）

GET /api/history?limit=50

### 地图数据

- GET /api/geo/china（GeoJSON）
- GET /api/geo/meta（来源、feature 数等）

### 二维码

GET /api/qrcode

### 重置（管理员）

POST /api/admin/reset

```json
{
  "password": "2025"
}
```

可通过环境变量 ADMIN_PASSWORD 修改默认口令。

### 健康检查

GET /health

## WebSocket 事件（大屏实时）

WebSocket 连接到同域（ws(s)://host）。

- initial_state：初始 stats + history
- region_lit：有人点亮（含 matched 与 stats）
- reset：重置通知

## 数据持久化

所有状态保存在 data/state.json，包含：

- litRegionState：已点亮地区（按 regionId/adcode）
- submissions：提交历史（含 inputPlaceName 与 matched）

## 常见问题

### Windows 下启动崩溃（EADDRINUSE）

端口被占用时，关闭占用 3000 的进程或换端口：

```powershell
netstat -ano | findstr ":3000"
taskkill /PID <PID> /F

$env:PORT = 3001; npm start
```