import { Router } from "express";
import { mountStub } from "../../lib/notImplemented.js";

const router = Router();

/** Owned by feat/ingest. Integration mounts 501 stubs only. */
mountStub(router, "ingest", [
  ["post", "/sessions"],
  ["get", "/sessions"],
  ["get", "/sessions/:sessionId"],
  ["post", "/sessions/:sessionId/files"],
  ["get", "/sessions/:sessionId/files"],
  ["post", "/sessions/:sessionId/complete"],
  ["post", "/sessions/:sessionId/commit"],
  ["post", "/sessions/:sessionId/cancel"],
  ["get", "/sessions/:sessionId/checksums"],
]);

export default router;
