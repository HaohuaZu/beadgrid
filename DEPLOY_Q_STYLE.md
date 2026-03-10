# Q版接口部署说明

## 微信云托管版

当前项目已经调整为可直接部署到微信云托管的 `Node.js + Express` 服务。

### 推荐模板

- 选择模板：`Express.js`

### 部署前需要配置

1. 在微信云托管里为服务配置环境变量：

```bash
DOUBAO_SEEDREAM_MODEL=doubao-seedream-4-5
DOUBAO_SEEDREAM_API_URL=https://ark.cn-beijing.volces.com/api/v3/images/generations
DOUBAO_SEEDREAM_AUTH_SCHEME=Bearer
DOUBAO_SEEDREAM_API_KEY=你的豆包 API Key
```

2. 小程序前端里配置云托管访问地址：

- 修改 `miniprogram/app.js`
- 把 `CLOUD_API_BASE_URL` 填成你的云托管公网域名，例如：

```js
const CLOUD_API_BASE_URL = "https://你的云托管域名";
```

3. 在微信小程序后台把该云托管域名加入 `request 合法域名`。

### 云托管自检

部署成功后先访问：

```bash
GET /healthz
```

返回 `{"ok":true,...}` 说明服务已经正常启动。

## 当前地址策略

- 微信开发者工具：默认走 `http://127.0.0.1:3000`
- 真机 / 线上：走 `miniprogram/app.js` 里的 `CLOUD_API_BASE_URL`

对应代码：
- `miniprogram/app.js`
- `server.js`

## 本地调试

1. 在项目根目录确认 `.env.local` 已存在，并包含：

```bash
ARK_API_KEY="你的豆包 API Key"
DOUBAO_SEEDREAM_MODEL="doubao-seedream-4-5-251128"
DOUBAO_SEEDREAM_API_URL="https://ark.cn-beijing.volces.com/api/v3/images/generations"
DOUBAO_SEEDREAM_AUTH_SCHEME="Bearer"
```

2. 启动本地服务：

```bash
npm run dev
```

3. 微信开发者工具重新编译小程序。

4. 在“创作”页选择 `卡通像素（Q版）`，直接测试生成。

## 真机部署

真机不会访问你电脑的 `127.0.0.1`，所以需要把后端部署到微信云托管，或者部署到一个对外可访问的正式域名。

### 需要同步的文件

- `server.js`
- `package.json`
- `package-lock.json`
- `lib/`
- `public/`
- `.env.local`

### 服务器命令

进入项目目录后执行：

```bash
npm install
npm run dev
```

如果你是用 `pm2`，建议：

```bash
pm2 delete bead-pattern-mvp || true
pm2 start npm --name bead-pattern-mvp -- run dev
pm2 save
```

### 部署后自检

先检查服务：

```bash
curl -X POST http://175.178.0.34/api/q-cartoonize
```

如果接口已部署，应该返回 `400` 和“缺少图片文件”，而不是 `404`。

再检查生成接口：

```bash
curl http://175.178.0.34
```

确认页面能打开，说明静态站点和服务都正常。

## 常见问题

### 1. 开发工具能用，真机不行

原因：
- 真机访问不到本地 `127.0.0.1`

处理：
- 把新后端部署到 `175.178.0.34`

### 2. 小程序点 Q版没有走豆包

排查：
- `.env.local` 是否存在
- `ARK_API_KEY` 是否正确
- `DOUBAO_SEEDREAM_MODEL` 是否正确
- 服务器是否重启

### 3. Q版生成后不能改最大边长

这是当前设计：
- `卡通像素（Q版）` 生成后锁定边长
- 避免编辑器里重复调用大模型 API
