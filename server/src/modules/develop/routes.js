import { Router } from "express";
import { mountStub } from "../../lib/notImplemented.js";

const router = Router();

/** Owned by feat/develop. Integration mounts 501 stubs only. */
mountStub(router, "develop", [
  ["get", "/assets/:assetId"],
  ["put", "/assets/:assetId"],
  ["get", "/presets"],
  ["post", "/presets"],
  ["post", "/assets/:assetId/apply-preset"],
  ["post", "/batch"],
  ["get", "/assets/:assetId/preview"],
]);

export default router;
