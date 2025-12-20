# 服务器部署检查清单

## 📋 部署前准备

### 1. 服务器环境
- [ ] Node.js 14+ 已安装 (`node --version`)
- [ ] npm 已安装 (`npm --version`)
- [ ] 端口 3000 可用（或准备使用其他端口）
- [ ] 足够的磁盘空间（至少 200MB）
- [ ] 服务器可以访问外网（用于加载 ECharts CDN）

### 2. 网络配置
- [ ] 服务器防火墙已开放对应端口
- [ ] 如使用 Nginx/Apache 反向代理，已配置 WebSocket 支持
- [ ] 确认服务器 IP 地址或域名
- [ ] SSL 证书（如需 HTTPS）已准备

### 3. 代码准备
- [ ] 代码已上传到服务器或使用 Git 克隆
- [ ] `.gitignore` 文件已配置（排除 `node_modules/` 和 `data/`）
- [ ] 环境变量已配置（如需自定义端口或密码）

## 🚀 部署步骤

### 步骤 1：上传代码
```bash
# 方式A：Git 克隆
cd /var/www
git clone https://github.com/your-repo/MpItProject.git
cd MpItProject

# 方式B：使用 scp 上传
# 在本地执行
scp -r MpItProject user@server:/var/www/
```

### 步骤 2：安装依赖
```bash
cd /var/www/MpItProject
npm install --production
```

### 步骤 3：测试启动
```bash
# 临时启动测试
npm start

# 在另一个终端测试
curl http://localhost:3000/health
```
应返回 `{"status":"ok",...}`

### 步骤 4：使用 PM2 部署（推荐）
```bash
# 全局安装 PM2
npm install -g pm2

# 启动应用
pm2 start backend/server.js --name "mpit-project"

# 查看状态
pm2 status

# 查看日志
pm2 logs mpit-project

# 设置开机自启
pm2 startup
pm2 save
```

说明：项目后端入口为 `backend/server.js`（不要再使用旧的 `server/` 目录）。

### 步骤 5：配置 Nginx 反向代理（可选）

创建 `/etc/nginx/sites-available/mpit`：
```nginx
upstream mpit_backend {
    server 127.0.0.1:3000;
}

server {
    listen 80;
    server_name your-domain.com;

    # 静态文件
    location /display.html {
        proxy_pass http://mpit_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /mobile.html {
        proxy_pass http://mpit_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # API 和 WebSocket
    location / {
        proxy_pass http://mpit_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

启用站点：
```bash
ln -s /etc/nginx/sites-available/mpit /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

### 步骤 6：配置 HTTPS（推荐）
```bash
# 使用 Certbot 获取免费 SSL 证书
apt install certbot python3-certbot-nginx
certbot --nginx -d your-domain.com
```

## ✅ 部署后验证

### 1. 基本功能测试
```bash
# 在服务器上
curl http://localhost:3000/health
curl http://localhost:3000/api/geo/meta
curl http://localhost:3000/api/lit/state
```

### 2. 外部访问测试
- [ ] 在本地浏览器打开 `http://your-server-ip:3000/display.html`
- [ ] 检查地图是否显示
- [ ] 检查二维码是否生成
- [ ] 检查 WebSocket 连接状态（右上角）

### 3. 手机端测试
- [ ] 手机浏览器打开 `http://your-server-ip:3000/mobile.html`
- [ ] 输入昵称和省份
- [ ] 点击提交
- [ ] 观察大屏是否实时更新

### 4. 功能完整性测试
- [ ] 提交多个不同省份
- [ ] 检查统计数据是否更新
- [ ] 测试重置功能（密码：默认 2025）
- [ ] 测试数据导出

### 5. 性能测试
```bash
# 使用 Apache Bench 测试（如已安装）
ab -n 100 -c 10 http://localhost:3000/api/lit/state
```

### 6. 持久化测试
```bash
# 重启服务
pm2 restart mpit-project

# 刷新大屏页面
# 检查之前点亮的省份是否保留
```

## 🔧 环境变量配置

### 使用 PM2 ecosystem 配置
创建 `ecosystem.config.js`：
```javascript
module.exports = {
  apps: [{
    name: 'mpit-project',
        script: 'backend/server.js',
    instances: 1,
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      HOST: '0.0.0.0',
      ADMIN_PASSWORD: 'YourSecurePassword123'
    }
  }]
};
```

启动：
```bash
pm2 start ecosystem.config.js
```

## 🔒 安全加固

### 1. 修改管理员密码
```bash
# 通过环境变量设置
ADMIN_PASSWORD=NewPassword pm2 start backend/server.js --name "mpit"
```

### 2. 配置防火墙
```bash
# UFW (Ubuntu)
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 3000/tcp  # 如直接暴露
ufw enable

# Firewalld (CentOS)
firewall-cmd --permanent --add-port=3000/tcp
firewall-cmd --reload
```

### 3. 启用访问日志
在 Nginx 中：
```nginx
access_log /var/log/nginx/mpit_access.log;
error_log /var/log/nginx/mpit_error.log;
```

## 📊 监控和维护

### 1. PM2 监控
```bash
# 查看实时监控
pm2 monit

# 查看日志
pm2 logs mpit-project

# 查看详细信息
pm2 show mpit-project
```

### 2. 定期备份数据
创建备份脚本 `backup.sh`：
```bash
#!/bin/bash
BACKUP_DIR="/var/backups/mpit"
mkdir -p $BACKUP_DIR
DATE=$(date +%Y%m%d_%H%M%S)
cp /var/www/MpItProject/data/state.json $BACKUP_DIR/state_$DATE.json
# 保留最近 30 天的备份
find $BACKUP_DIR -name "state_*.json" -mtime +30 -delete
```

添加到 crontab：
```bash
# 每天凌晨 2 点备份
0 2 * * * /path/to/backup.sh
```

### 3. 日志轮转
创建 `/etc/logrotate.d/pm2-mpit`：
```
/root/.pm2/logs/mpit-project-*.log {
    daily
    rotate 7
    compress
    delaycompress
    notifempty
    create 0640 root root
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
```

## 🚨 故障排查

### PM2 无法启动
```bash
# 检查日志
pm2 logs mpit-project --lines 50

# 重启
pm2 restart mpit-project

# 完全重启
pm2 delete mpit-project
pm2 start backend/server.js --name "mpit-project"
```

### 内存不足
```bash
# 检查内存使用
pm2 list
free -h

# 如需要，增加 swap
dd if=/dev/zero of=/swapfile bs=1M count=2048
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
```

### 端口被占用
```bash
# 查找占用进程
lsof -i :3000
netstat -tulpn | grep 3000

# 杀掉进程
kill -9 <PID>
```

## 📱 移动端二维码配置

### 1. 使用公网 IP
确保二维码指向公网可访问的地址：
- 修改服务器启动时的 HOST 为 `0.0.0.0`
- 二维码会自动使用访问大屏时的域名

### 2. 使用域名
如配置了域名，二维码会自动使用域名地址。

## ✅ 最终检查清单

部署完成后，确认以下所有项：

### 功能
- [ ] 大屏能正常显示地图
- [ ] 手机端能正常提交
- [ ] 实时更新正常工作
- [ ] 二维码能正常扫描
- [ ] 统计数据正确显示
- [ ] 重置功能正常
- [ ] 数据导出正常

### 性能
- [ ] 页面加载速度 < 3秒
- [ ] WebSocket 延迟 < 1秒
- [ ] 支持至少 50 人同时在线

### 安全
- [ ] 管理员密码已修改
- [ ] 防火墙已配置
- [ ] HTTPS 已启用（如需要）
- [ ] 访问日志已启用

### 运维
- [ ] PM2 自启动已配置
- [ ] 日志已配置
- [ ] 备份脚本已设置
- [ ] 监控已启用

## 📞 获取帮助

如遇到问题：
1. 查看 PM2 日志：`pm2 logs mpit-project`
2. 检查 Nginx 日志：`tail -f /var/log/nginx/error.log`
3. 运行健康检查：`curl http://localhost:3000/health`
4. 查看系统资源：`htop` 或 `top`

---

**部署完成后请保存此清单作为运维参考！**
