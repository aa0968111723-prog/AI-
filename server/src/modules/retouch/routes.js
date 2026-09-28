import { Router } from "express";
import { mountStub } from "../../lib/notImplemented.js";

const router = Router();

/** Owned by feat/retouch. Integration mounts 501 stubs only. */
mountStub(router, "retouch", [
  ["get", "/jobs"],
  ["post", "/jobs"],
  ["get", "/jobs/:id"],
  ["post", "/jobs/:id/cancel"],
  ["post", "/jobs/:id/approve"],
]);

export default router;
