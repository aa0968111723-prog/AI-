import express from "express";
import cors from "cors";
import morgan from "morgan";
import path from "node:path";
import fs from "node:fs";
import { config } from "./config.js";
import healthRouter from "./routes/health.js";
import agentRouter from "./routes/agent.js";
import jobsRouter from "./modules/jobs/routes.js";
import ingestRouter from "./modules/ingest/routes.js";
import catalogRouter from "./modules/catalog/routes.js";
import cullingRouter from "./modules/culling/routes.js";
import developRouter from "./modules/develop/routes.js";
import retouchRouter from "./modules/retouch/routes.js";
import colorRouter from "./modules/color/routes.js";
import exportRouter from "./modules/export/routes.js";
import galleryRouter from "./modules/gallery/routes.js";
import { errorHandler, notFound } from "./middleware/error.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(morgan(config.env === "production" ? "combined" : "dev"));
  app.use(
    cors({
      origin: config.clientOrigin.split(",").map((s) => s.trim()),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "8mb" }));
  app.use(express.urlencoded({ extended: true }));

  const api = config.apiPrefix;
  app.use(api, healthRouter);
  app.use(`${api}/agent`, agentRouter);
  app.use(`${api}/jobs`, jobsRouter);
  app.use(`${api}/clients`, jobsRouter);
  app.use(`${api}/ingest`, ingestRouter);
  app.use(`${api}/catalog`, catalogRouter);
  app.use(`${api}/culling`, cullingRouter);
  app.use(`${api}/develop`, developRouter);
  app.use(`${api}/retouch`, retouchRouter);
  app.use(`${api}/color`, colorRouter);
  app.use(`${api}/export`, exportRouter);
  app.use(`${api}/gallery`, galleryRouter);

  if (fs.existsSync(config.clientDist)) {
    app.use(express.static(config.clientDist));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/")) return next();
      return res.sendFile(path.join(config.clientDist, "index.html"));
    });
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
