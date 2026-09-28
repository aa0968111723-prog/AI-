import { Router } from "express";
import { mountStub } from "../../lib/notImplemented.js";

const router = Router();

/** Owned by feat/catalog. Integration mounts 501 stubs only. */
mountStub(router, "catalog", [
  ["get", "/projects"],
  ["post", "/projects"],
  ["get", "/projects/:id"],
  ["patch", "/projects/:id"],
  ["get", "/projects/:id/assets"],
  ["get", "/assets"],
  ["post", "/assets"],
  ["get", "/assets/:assetId"],
  ["patch", "/assets/:assetId"],
  ["get", "/assets/:assetId/exif"],
  ["get", "/assets/:assetId/renditions"],
  ["get", "/albums"],
  ["post", "/albums"],
  ["post", "/albums/:albumId/assets"],
]);

export default router;
