import { Router } from "express";
import { mountStub } from "../../lib/notImplemented.js";

const router = Router();

/** Owned by feat/export. Integration mounts 501 stubs only. */
mountStub(router, "export", [
  ["get", "/presets"],
  ["post", "/presets"],
  ["post", "/jobs"],
  ["get", "/jobs"],
  ["get", "/jobs/:id"],
  ["get", "/jobs/:id/download"],
]);

export default router;
