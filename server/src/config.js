import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");

dotenv.config({ path: path.join(rootDir, ".env") });

export const config = {
  env: process.env.NODE_ENV || "development",
  host: process.env.HOST || "0.0.0.0",
  port: Number(process.env.PORT || 3001),
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  apiPrefix: process.env.API_PREFIX || "/api/v1",
  publicBaseUrl: process.env.PUBLIC_BASE_URL || "http://localhost:3001",
  dataDir: process.env.DATA_DIR || "./data",
  uploadDir: process.env.UPLOAD_DIR || "./data/uploads",
  thumbDir: process.env.THUMB_DIR || "./data/thumbs",
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 250),
  rootDir,
  clientDist: path.join(rootDir, "client/dist"),
};
