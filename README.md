# 攝影工作流代理 Photo Workflow Agent

專業攝影後製工作流平台骨架。本專案位於 [aa0968111723-prog/AI-](https://github.com/aa0968111723-prog/AI-)。

整合層（本對話）只負責：專案骨架、套件設定、環境變數範例、README、供其他 9 個對話使用的 API 契約、分支整合與可啟動/可建置驗證。
**不代替其他對話實作其專屬模組。**

## 技術梯

- 前端：React + Vite（`client/`）
- 後端：Node.js + Express（`server/`）
- 套件：根目錄 npm workspaces

## 快速開始

```bash
cp .env.example .env
npm install
npm run dev
```

- 前端：http://localhost:5173
- 後端：http://localhost:3001
- 健康檢查：`GET http://localhost:3001/api/v1/health`

建置與啟動：

```bash
npm run build
npm start
```

驗證：

```bash
curl -s http://localhost:3001/api/v1/health
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/v1/jobs
# health 應為 200；jobs 等 9 模組應為 501 MODULE_NOT_IMPLEMENTED
```

## 目錄

```
client/                 React + Vite
server/src/index.js     後端進入點
server/src/app.js       路由掛載
server/src/modules/     模組目錄（骨架 + 501 stub）
server/scheduler/       保留給 feat/scheduler-engine，整合層不實作
server/storage/         保留給 feat/server-api-storage，整合層不實作
docs/API.md             其他 9 個對話的契約來源
docs/MODULES.md         模組邊界
```

## 供其他 9 個對話使用的模組

| # | 模組 | 前纄 | 分支 |
|---|--------|--------|--------|
| 1 | jobs | `/api/v1/jobs` | `feat/jobs` |
| 2 | ingest | `/api/v1/ingest` | `feat/ingest` |
| 3 | catalog | `/api/v1/catalog` | `feat/catalog` |
| 4 | culling | `/api/v1/culling` | `feat/culling` |
| 5 | develop | `/api/v1/develop` | `feat/develop` |
| 6 | retouch | `/api/v1/retouch` | `feat/retouch` |
| 7 | color | `/api/v1/color` | `feat/color` |
| 8 | export | `/api/v1/export` | `feat/export` |
| 9 | gallery | `/api/v1/gallery` | `feat/gallery` |

整合層自有：`/api/v1/health`、`/api/v1/version`、`/api/v1/modules`、`/api/v1/agent`。

另外保留（不算進 9 模組業務實作）：
- 排程引擎位於 `feat/scheduler-engine`，僅 `server/scheduler/`
- 儲存/API 位於 `feat/server-api-storage`，僅 `server/storage/`

## 契約規則

成功：`{ ok: true, data, error: null, meta }`
失敗：`{ ok: false, data: null, error: { code, message, details? }, meta }`
未實作：HTTP 501 + `code=MODULE_NOT_IMPLEMENTED`

分頁：`?page=1&pageSize=50`

詳見 `docs/API.md`。其他對話只改自己的 `server/src/modules/<module>/`、`client/src/pages/<Module>Page.jsx`、`client/src/api/<module>.js`。禁止改 envelope 與 `app.js` 掛載方式。
