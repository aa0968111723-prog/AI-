import { sendFailure } from "./envelope.js";

export function notImplemented(moduleId) {
  return function moduleNotImplemented(req, res) {
    return sendFailure(
      res,
      req,
      501,
      "MODULE_NOT_IMPLEMENTED",
      `Module '${moduleId}' is reserved for another conversation and is not implemented yet`,
      { module: moduleId, method: req.method, path: req.originalUrl },
    );
  };
}

export function mountStub(router, moduleId, routes) {
  const handler = notImplemented(moduleId);
  for (const route of routes) {
    const [method, path] = route;
    router[method](path, handler);
  }
  router.all("*", handler);
  return router;
}
