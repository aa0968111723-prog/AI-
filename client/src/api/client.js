const API_BASE = "/api/v1";

export async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const payload = await response.json().catch(() => null);
  if (!payload) throw new Error(`Empty response for ${path} (${response.status})`);
  return { status: response.status, ...payload };
}

export const endpoints = {
  health: () => api("/health"),
  version: () => api("/version"),
  modules: () => api("/modules"),
  plan: (goal, context) =>
    api("/agent/plan", { method: "POST", body: JSON.stringify({ goal, context }) }),
};
