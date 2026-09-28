# Photo Workflow Agent API Contract

Base URL: `/api/v1`
Content-Type: `application/json` except ingest file upload (`multipart/form-data`).
IDs: UUID v4. Timestamps: ISO-8601 UTC.

This document is the contract source for nine other conversations.
Integration implements only health, version, modules, and the agent shell.

Reserved internal packages (not implemented here):
- `server/scheduler/` from `feat/scheduler-engine` (10-channel FIFO engine)
- `server/storage/` from `feat/server-api-storage`
- `server/xai/` from `feat/server-xai`
- queue UI from `feat/queue-panel`

## Envelope

Success:
```json
{ "ok": true, "data": {}, "error": null, "meta": { "requestId": "uuid", "ts": "2026-09-28T00:00:00.000Z" } }
```

Failure:
```json
{ "ok": false, "data": null, "error": { "code": "MODULE_NOT_IMPLEMENTED", "message": "Module jobs is not implemented yet", "details": null }, "meta": { "requestId": "uuid", "ts": "2026-09-28T00:00:00.000Z" } }
```

List payloads use `data.items`. Query pagination: `page` (1-based), `pageSize` (default 50, max 200).
Meta may also include `page`, `pageSize`, `total`, `hasMore`.

## Error codes

| HTTP | code |
|---|---|
| 400 | VALIDATION_ERROR |
| 401 | UNAUTHORIZED |
| 404 | NOT_FOUND |
| 409 | CONFLICT |
| 501 | MODULE_NOT_IMPLEMENTED |
| 500 | INTERNAL_ERROR |

Unimplemented module routes MUST return HTTP 501 and `MODULE_NOT_IMPLEMENTED`.
Accept `Idempotency-Key` on POST task endpoints.

## State machines

- Job: draft → booked → shooting → ingesting → culling → editing → exporting → delivered → archived
- Asset: uploaded → indexed → culled_out|selected → developed → retouched → exported
- Async (session/run/job): queued → running → succeeded|failed|canceled

## Integration

| Method | Path |
|---|---|
| GET | `/health` |
| GET | `/version` |
| GET | `/modules` |
| POST | `/agent/plan` |
| POST | `/agent/runs` |
| GET | `/agent/runs/:id` |
| POST | `/agent/runs/:id/cancel` |

Agent is a rule-based orchestration shell. Do not call model vendors here.

## 1. jobs `/api/v1/jobs`

GET/POST `/jobs`
GET/PATCH/DELETE `/jobs/:jobId`
GET `/jobs/:jobId/timeline`
GET/POST `/jobs/:jobId/briefs`
GET `/jobs/:jobId/crew`
GET/POST `/clients`
GET `/clients/:id`

POST `/jobs` body: `{ title, client, shootDate, location, type: wedding|portrait|commercial|event|other }`

## 2. ingest `/api/v1/ingest`

POST/GET `/ingest/sessions`
GET `/ingest/sessions/:sessionId`
POST/GET `/ingest/sessions/:sessionId/files`
POST `/ingest/sessions/:sessionId/complete`
POST `/ingest/sessions/:sessionId/commit`
POST `/ingest/sessions/:sessionId/cancel`
GET `/ingest/sessions/:sessionId/checksums`

POST session body: `{ jobId?, projectId?, source: card|disk|tether|upload, destPath? }`
Files upload uses multipart field `files[]`.

## 3. catalog `/api/v1/catalog`

GET/POST `/catalog/projects`
GET/PATCH `/catalog/projects/:id`
GET `/catalog/projects/:id/assets`
GET/POST `/catalog/assets`
GET/PATCH `/catalog/assets/:assetId`
GET `/catalog/assets/:assetId/exif`
GET `/catalog/assets/:assetId/renditions`
GET/POST `/catalog/albums`
POST `/catalog/albums/:albumId/assets`

## 4. culling `/api/v1/culling`

Use `/culling/runs`, never `/culling/jobs`.

POST `/culling/runs` `{ projectId, mode: auto|manual, options? }`
GET `/culling/runs/:id`
POST `/culling/runs/:id/apply`
GET/PUT `/culling/assets/:assetId` `{ rating?, flag?, label?, notes? }`
POST `/culling/batches`
POST `/culling/ai-select`
GET `/culling/projects/:projectId/picks`
GET `/culling/projects/:projectId/rejects`

## 5. develop `/api/v1/develop`

GET/PUT `/develop/assets/:assetId`
GET/POST `/develop/presets`
POST `/develop/assets/:assetId/apply-preset`
POST `/develop/batch`
GET `/develop/assets/:assetId/preview`

## 6. retouch `/api/v1/retouch`

GET/POST `/retouch/jobs`
GET `/retouch/jobs/:id`
POST `/retouch/jobs/:id/cancel`
POST `/retouch/jobs/:id/approve`

## 7. color `/api/v1/color`

GET/POST `/color/looks`
POST `/color/apply`
POST `/color/assets/:assetId/apply`
GET `/color/assets/:assetId`

## 8. export `/api/v1/export`

GET/POST `/export/presets`
POST/GET `/export/jobs`
GET `/export/jobs/:id`
GET `/export/jobs/:id/download`

## 9. gallery `/api/v1/gallery`

Keep prefix `/gallery`. Use albums, not `/galleries`.

GET/POST `/gallery/albums`
GET/PATCH `/gallery/albums/:id`
POST `/gallery/albums/:id/publish`
POST `/gallery/albums/:id/assets`
POST `/gallery/albums/:id/share`
GET/POST `/gallery/albums/:id/selections`
GET `/gallery/share/:token`
POST `/gallery/share/:token/selects`
POST `/gallery/public/:slug/select`
