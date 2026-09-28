import { sendFailure } from "../lib/envelope.js";

export function notFound(req, res) {
  return sendFailure(
    res,
    req,
    404,
    "NOT_FOUND",
    `No route for ${req.method} ${req.originalUrl}`,
  );
}

export function errorHandler(err, req, res, _next) {
  const status = Number(err.status || err.statusCode || 500);
  const code = err.code || (status === 400 ? "VALIDATION_ERROR" : "INTERNAL_ERROR");
  const message = status >= 500 ? "Internal server error" : err.message || "Request failed";
  if (status >= 500) {
    console.error(err);
  }
  return sendFailure(res, req, status, code, message, err.details || null);
}
