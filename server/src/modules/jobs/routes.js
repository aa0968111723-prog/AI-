import { Router } from "express";
import { mountStub } from "../../lib/notImplemented.js";

const router = Router();

/**
 * Owned by feat/jobs. Integration mounts 501 stubs only.
 * Also owns /api/v1/clients when mounted at that prefix.
 */
mountStub(router, "jobs", [
  ["get", "/"],
  ["post", "/"],
  ["get", "/:jobId"],
  ["patch", "/:jobId"],
  ["delete", "/:jobId"],
  ["get", "/:jobId/timeline"],
  ["get", "/:jobId/briefs"],
  ["post", "/:jobId/briefs"],
  ["get", "/:jobId/crew"],
]);

export default router;
