export const VERSION = "0.1.0";
export const SERVICE = "photo-workflow-agent";

export const MODULES = [
  { id: "jobs", conversation: 1, branch: "feat/jobs", prefix: "/api/v1/jobs", status: "stub", title: "檔期 / 專案 / 客戶" },
  { id: "ingest", conversation: 2, branch: "feat/ingest", prefix: "/api/v1/ingest", status: "stub", title: "匯入 / 記憶卡 / 檔案" },
  { id: "catalog", conversation: 3, branch: "feat/catalog", prefix: "/api/v1/catalog", status: "stub", title: "資產目錄 / EXIF / 相簿" },
  { id: "culling", conversation: 4, branch: "feat/culling", prefix: "/api/v1/culling", status: "stub", title: "挑圖 / 評分 / AI 初選" },
  { id: "develop", conversation: 5, branch: "feat/develop", prefix: "/api/v1/develop", status: "stub", title: "RAW 顯影 / 基本調整" },
  { id: "retouch", conversation: 6, branch: "feat/retouch", prefix: "/api/v1/retouch", status: "stub", title: "修圖 / 生成式編輯" },
  { id: "color", conversation: 7, branch: "feat/color", prefix: "/api/v1/color", status: "stub", title: "色彩 / Look / LUT" },
  { id: "export", conversation: 8, branch: "feat/export", prefix: "/api/v1/export", status: "stub", title: "匯出 / 交付包" },
  { id: "gallery", conversation: 9, branch: "feat/gallery", prefix: "/api/v1/gallery", status: "stub", title: "客戶相簿 / 選片" }
];

export const INTEGRATION = {
  id: "integration",
  conversation: 0,
  branch: "main",
  prefixes: ["/api/v1/health", "/api/v1/version", "/api/v1/modules", "/api/v1/agent"],
  status: "ready",
  title: "整合層 / 編排殼"
};
