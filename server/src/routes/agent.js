import { Router } from "express";
import { randomUUID } from "node:crypto";
import { sendFailure, sendSuccess } from "../lib/envelope.js";
import { MODULES } from "../lib/registry.js";

const router = Router();
const runs = new Map();

const PIPELINE = [
  { module: "jobs", action: "ensure-job", input: { from: "context.jobId" } },
  { module: "ingest", action: "open-session", input: { source: "upload" } },
  { module: "catalog", action: "index-assets", input: {} },
  { module: "culling", action: "ai-select", input: { strategy: "keepers" } },
  { module: "develop", action: "apply-preset", input: {} },
  { module: "retouch", action: "queue-jobs", input: {} },
  { module: "color", action: "apply-look", input: {} },
  { module: "export", action: "render-delivery", input: {} },
  { module: "gallery", action: "publish-album", input: {} },
];

function planFromGoal(goal, context = {}) {
  const wanted = String(goal || "").toLowerCase();
  const steps = PIPELINE.filter((step) => {
    if (!wanted) return true;
    return (
      wanted.includes(step.module) ||
      wanted.includes(step.action) ||
      wanted.includes("full") ||
      wanted.includes("完整") ||
      wanted.includes("workflow") ||
      wanted.includes("工作流")
    );
  });
  return {
    planId: randomUUID(),
    goal: goal || "full-workflow",
    context,
    steps: (steps.length ? steps : PIPELINE).map((step, index) => ({
      ...step,
      order: index + 1,
      moduleStatus: MODULES.find((m) => m.id === step.module)?.status || "stub",
    })),
  };
}

router.post("/plan", (req, res) => {
  const goal = req.body?.goal;
  if (goal != null && typeof goal !== "string") {
    return sendFailure(res, req, 400, "VALIDATION_ERROR", "goal must be a string");
  }
  const plan = planFromGoal(goal, req.body?.context || {});
  return sendSuccess(res, req, plan, {}, 201);
});

router.post("/runs", (req, res) => {
  const goal = req.body?.goal;
  const dryRun = Boolean(req.body?.dryRun ?? true);
  const plan = req.body?.planId
    ? {
        planId: req.body.planId,
        goal: goal || "full-workflow",
        context: req.body?.context || {},
        steps: PIPELINE.map((s, i) => ({ ...s, order: i + 1 })),
      }
    : planFromGoal(goal, req.body?.context || {});

  const run = {
    runId: randomUUID(),
    planId: plan.planId,
    goal: plan.goal,
    status: dryRun ? "dry_run" : "accepted",
    note: "Integration agent is an orchestration shell only. It does not call model providers and does not execute sibling module business logic.",
    steps: plan.steps.map((step) => ({
      ...step,
      status: dryRun ? "skipped" : "blocked_not_implemented",
    })),
    createdAt: new Date().toISOString(),
  };
  runs.set(run.runId, run);
  return sendSuccess(res, req, run, {}, 202);
});

router.get("/runs/:runId", (req, res) => {
  const run = runs.get(req.params.runId);
  if (!run) {
    return sendFailure(res, req, 404, "NOT_FOUND", `Agent run '${req.params.runId}' was not found`);
  }
  return sendSuccess(res, req, run);
});

router.post("/runs/:runId/cancel", (req, res) => {
  const run = runs.get(req.params.runId);
  if (!run) {
    return sendFailure(res, req, 404, "NOT_FOUND", `Agent run '${req.params.runId}' was not found`);
  }
  run.status = "canceled";
  run.canceledAt = new Date().toISOString();
  return sendSuccess(res, req, run);
});

export default router;
