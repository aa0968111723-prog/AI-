import { Router } from "express";
import { mountStub } from "../../lib/notImplemented.js";

const router = Router();

/** Owned by feat/color. Integration mounts 501 stubs only. */
mountStub(router, "color", [
  ["get", "/looks"],
  ["post", "/looks"],
  ["post", "/apply"],
  ["post", "/assets/:assetId/apply"],
  ["get", "/assets/:assetId"],
]);

export default router;
