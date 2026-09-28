import { Router } from "express";
import { mountStub } from "../../lib/notImplemented.js";

const router = Router();

/** Owned by feat/culling. Use /runs, never /jobs. Integration mounts 501 stubs only. */
mountStub(router, "culling", [
  ["post", "/runs"],
  ["get", "/runs/:id"],
  ["post", "/runs/:id/apply"],
  ["get", "/assets/:assetId"],
  ["put", "/assets/:assetId"],
  ["post", "/batches"],
  ["post", "/ai-select"],
  ["get", "/projects/:projectId/picks"],
  ["get", "/projects/:projectId/rejects"],
]);

export default router;
