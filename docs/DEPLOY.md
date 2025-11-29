# 部署指南

## 方案一：Render 部署

### 1. 创建服务
- 登录 [Render](https://render.com)
- 新建 Web Service，连接 GitHub 仓库

### 2. 配置构建
- **Build Command**: `npm ci && npm run build`
- **Start Command**: `npm run start`

### 3. 环境变量
在 Environment 中添加：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| TELEGRAM_BOT_TOKEN | 你的Token | Bot Token |
| FORWARD_TARGET_ID | -100xxx | 目标频道 |
| REVIEW_TARGET_ID | -100xxx | 审核频道 |
| ADMIN_IDS | 123456,789012 | 管理员ID |
| PERSIST_BACKEND | sqlite | 存储后端 |
| SQLITE_PATH | /data/bot.db | 数据库路径 |
| USE_AI_REVIEW | 1 | AI 审核开关 |
| AI_API_KEY | sk-xxx | OpenAI Key |
| AI_MODEL | gpt-4.1-mini | AI 模型 |

### 4. 持久化存储
- 添加 Disk，挂载路径 `/data`
- 大小 1GB 足够

### 5. 健康检查
- Path: `/healthz`

---

## 方案二：VPS 服务器部署

### 1. 安装 Node.js
```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证安装
node -v
npm -v
```

### 2. 克隆项目
```bash
git clone https://github.com/你的用户名/sh_mod_forward_bot.git
cd sh_mod_forward_bot
npm install
```

### 3. 配置环境
```bash
cp .env.example .env
nano .env  # 编辑配置
```

### 4. 构建项目
```bash
npm run build
```

### 5. 使用 PM2 运行
```bash
# 安装 PM2
npm install -g pm2

# 启动服务
pm2 start dist/index.js --name "tg-bot"

# 设置开机自启
pm2 startup
pm2 save
```

### 6. 查看日志
```bash
pm2 logs tg-bot
```

### 7. 常用 PM2 命令
```bash
pm2 restart tg-bot  # 重启
pm2 stop tg-bot     # 停止
pm2 delete tg-bot   # 删除
pm2 status          # 查看状态
```

---

## 方案三：Docker 部署（可选）

### Dockerfile
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
COPY .env ./
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### 构建运行
```bash
npm run build
docker build -t tg-bot .
docker run -d --name tg-bot -p 3000:3000 --env-file .env tg-bot
```

---

## 注意事项

1. **Bot 权限**: 目标为频道时，必须将机器人设为管理员
2. **隐私模式**: 若要接收群普通消息，需在 BotFather 关闭 `/setprivacy`
3. **数据持久化**: 使用 SQLite 时，确保数据目录有写入权限
4. **API Key**: AI 审核需要有效的 OpenAI API Key
5. **网络**: 确保服务器可访问 api.telegram.org 和 api.openai.com
