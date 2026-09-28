import { Router } from "express";
import { sendSuccess } from "../lib/envelope.js";
import { INTEGRATION, MODULES, SERVICE, VERSION } from "../lib/registry.js";

const router = Router();

router.get("/health", (req, res) => {
  return sendSuccess(res, req, {
    status: "ok",
    service: SERVICE,
    version: VERSION,
    uptime: process.uptime(),
  });
});

router.get("/version", (req, res) => {
  return sendSuccess(res, req, {
    service: SERVICE,
    version: VERSION,
    api: "v1",
  });
});

router.get("/modules", (req, res) => {
  return sendSuccess(res, req, {
    integration: INTEGRATION,
    modules: MODULES,
  });
});

export default router;
