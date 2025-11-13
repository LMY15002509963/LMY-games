# 部署指南

## 快速部署

### 1. 部署到 Vercel (推荐)

1. **推送到 GitHub**
   ```bash
   git remote add origin <你的GitHub仓库地址>
   git push -u origin main
   ```

2. **使用 Vercel 部署**
   - 访问 [vercel.com](https://vercel.com)
   - 使用 GitHub 账号登录
   - 点击 "New Project"
   - 选择你的 GitHub 仓库
   - 点击 "Deploy"

3. **配置环境变量** (如果需要)
   - 在 Vercel 项目设置中添加所需的环境变量

### 2. 部署到 Heroku

1. **安装 Heroku CLI**
   ```bash
   # 下载并安装 Heroku CLI
   ```

2. **登录 Heroku**
   ```bash
   heroku login
   ```

3. **创建应用**
   ```bash
   heroku create <应用名称>
   ```

4. **推送代码**
   ```bash
   git push heroku main
   ```

### 3. 部署到 GitHub Pages

1. **启用 GitHub Pages**
   - 进入 GitHub 仓库设置
   - 找到 "Pages" 选项
   - 选择 "Deploy from a branch"
   - 选择 "main" 分支和 "/(root)" 目录

2. **自动部署**
   - 推送代码后会自动触发 GitHub Actions
   - 构建完成后自动部署到 GitHub Pages

### 4. 本地运行

1. **安装依赖**
   ```bash
   npm install
   ```

2. **启动服务器**
   ```bash
   npm start
   ```

3. **访问游戏**
   ```
   http://localhost:3000
   ```

## 服务器要求

- Node.js 14.0.0 或更高版本
- 支持 WebSocket 连接
- 至少 512MB 内存
- 支持 CORS

## 游戏配置

### 修改世界大小
在 `server.js` 中修改：
```javascript
const WORLD_WIDTH = 8000;  // 世界宽度
const WORLD_HEIGHT = 8000; // 世界高度
```

### 修改最大玩家数
在 `server.js` 中修改：
```javascript
const MAX_PLAYERS_PER_ROOM = 50; // 最大玩家数
```

### 修改AI玩家数量
在 `GameRoom` 构造函数中修改：
```javascript
this.maxAIPlayers = 15;     // 最大AI玩家数
this.minTotalPlayers = 8;   // 最小总玩家数
```

## 常见问题

### Q: 游戏无法连接到服务器
A: 检查服务器是否正确启动，端口是否被占用，防火墙设置是否正确。

### Q: 玩家无法加入游戏
A: 检查服务器是否达到最大玩家数限制，网络连接是否正常。

### Q: AI玩家行为异常
A: 检查服务器端AI逻辑是否正确更新，网络延迟是否过高。

### Q: 游戏卡顿
A: 检查服务器性能，优化渲染设置，减少粒子效果。

## 监控和维护

### 查看服务器日志
```bash
# 对于 PM2 管理的进程
pm2 logs

# 对于直接运行的进程
# 查看控制台输出
```

### 重启服务器
```bash
# 使用 PM2
pm2 restart app

# 或者直接重启进程
npm restart
```

### 更新游戏
```bash
git pull origin main
npm install
npm restart
```

## 性能优化建议

1. **服务器端**
   - 使用 PM2 进行进程管理
   - 启用 Gzip 压缩
   - 使用 CDN 加速静态资源

2. **客户端**
   - 启用硬件加速
   - 减少不必要的渲染
   - 优化网络请求

3. **网络**
   - 使用 WebSocket 压缩
   - 优化数据传输格式
   - 减少同步频率

## 安全注意事项

- 定期更新依赖包
- 限制连接频率
- 验证用户输入
- 监控异常流量

## 技术支持

如果遇到问题，请：
1. 查看控制台错误信息
2. 检查服务器日志
3. 确认网络连接正常
4. 提交 Issue 到 GitHub 仓库