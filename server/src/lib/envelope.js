import { randomUUID } from "node:crypto";

export function requestIdFrom(req) {
  return req.headers["x-request-id"] || randomUUID();
}

export function success(req, data, extraMeta = {}, status = 200) {
  const page = extraMeta.page;
  const pageSize = extraMeta.pageSize;
  const total = extraMeta.total;
  const meta = {
    requestId: requestIdFrom(req),
    ts: new Date().toISOString(),
    ...extraMeta,
  };
  if (page != null && pageSize != null && total != null) {
    meta.hasMore = page * pageSize < total;
  }
  return { status, body: { ok: true, data, error: null, meta } };
}

export function failure(req, status, code, message, details = null, extraMeta = {}) {
  return {
    status,
    body: {
      ok: false,
      data: null,
      error: { code, message, details },
      meta: {
        requestId: requestIdFrom(req),
        ts: new Date().toISOString(),
        ...extraMeta,
      },
    },
  };
}

export function sendSuccess(res, req, data, extraMeta, status) {
  const payload = success(req, data, extraMeta, status);
  return res.status(payload.status).json(payload.body);
}

export function sendFailure(res, req, status, code, message, details, extraMeta) {
  const payload = failure(req, status, code, message, details, extraMeta);
  return res.status(payload.status).json(payload.body);
}
