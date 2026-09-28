# Module boundaries

Integration owns the skeleton, envelope, route mounting, health/version/modules/agent shell, README, and env example.

Other conversations implement one module only.

| Module | Own these files | Do not touch |
|---|---|---|
| jobs | `server/src/modules/jobs/**`, `client/src/pages/JobsPage.jsx`, `client/src/api/jobs.js` | other modules, envelope, app.js mount list |
| ingest | `server/src/modules/ingest/**`, `client/src/pages/IngestPage.jsx`, `client/src/api/ingest.js` | other modules |
| catalog | `server/src/modules/catalog/**`, `client/src/pages/CatalogPage.jsx`, `client/src/api/catalog.js` | other modules |
| culling | `server/src/modules/culling/**`, `client/src/pages/CullingPage.jsx`, `client/src/api/culling.js` | other modules |
| develop | `server/src/modules/develop/**`, `client/src/pages/DevelopPage.jsx`, `client/src/api/develop.js` | other modules |
| retouch | `server/src/modules/retouch/**`, `client/src/pages/RetouchPage.jsx`, `client/src/api/retouch.js` | other modules |
| color | `server/src/modules/color/**`, `client/src/pages/ColorPage.jsx`, `client/src/api/color.js` | other modules |
| export | `server/src/modules/export/**`, `client/src/pages/ExportPage.jsx`, `client/src/api/export.js` | other modules |
| gallery | `server/src/modules/gallery/**`, `client/src/pages/GalleryPage.jsx`, `client/src/api/gallery.js` | other modules |

Reserved by other feature branches (integration does not implement):

- `server/scheduler/` ← `feat/scheduler-engine`
- `server/storage/` ← `feat/server-api-storage`

Rules:

1. Keep every documented route. Replace 501 with real logic; do not delete the route.
2. Always return the shared envelope from `docs/API.md`.
3. Async names: ingest session, culling run, retouch/export job, agent run.
4. Open PRs against `main` from `feat/<module>`.
