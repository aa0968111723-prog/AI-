import { Router } from "express";
import { mountStub } from "../../lib/notImplemented.js";

const router = Router();

/** Owned by feat/gallery. Keep prefix /gallery. Integration mounts 501 stubs only. */
mountStub(router, "gallery", [
  ["get", "/albums"],
  ["post", "/albums"],
  ["get", "/albums/:id"],
  ["patch", "/albums/:id"],
  ["post", "/albums/:id/publish"],
  ["post", "/albums/:id/assets"],
  ["post", "/albums/:id/share"],
  ["get", "/albums/:id/selections"],
  ["post", "/albums/:id/selections"],
  ["get", "/share/:token"],
  ["post", "/share/:token/selects"],
  ["post", "/public/:slug/select"],
]);

export default router;
