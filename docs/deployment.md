# RequestLab Deployment Preparation

This document describes the Aşama 6A production shape. No deployment, DNS change, or service mutation was performed.

## Architecture

- Vercel serves the static `apps/web` React/Vite build at `requestlab.yusufdere.com`.
- Render runs the RequestLab API at `api.requestlab.yusufdere.com`.
- The API starts the replay worker in the same process only when `RUN_REPLAY_WORKER=true`.
- Render runs the Demo API at `demo.requestlab.yusufdere.com`.
- Supabase provides PostgreSQL and Upstash provides Redis/BullMQ.
- Render free services may sleep; the first request after inactivity can experience cold-start latency.

## Public Demo

The browser requests a short-lived API-issued demo session and keeps its bearer token in memory only. The API resolves the configured demo project and user server-side. The only public scenario names are `order-error`, `login-error`, and `slow-request`; the API calls the Demo API through an internal trigger secret. The browser cannot choose a URL, method, body, header, project, user, or environment.

Production replay is limited to HTTPS hosts in `REPLAY_ALLOWED_HOSTS`, defaults to `demo.requestlab.yusufdere.com`, and preserves redirect, DNS/IP, dangerous-header, masking, idempotency, and response-size protections.

## Environment Map

| Service         | Variable                       | Secret | Description                     |
| --------------- | ------------------------------ | -----: | ------------------------------- |
| Vercel Web      | `VITE_REQUESTLAB_API_URL`      |     No | Public API URL                  |
| Vercel Web      | `VITE_REQUESTLAB_DEMO_API_URL` |     No | Public Demo API URL             |
| Vercel Web      | `VITE_DEMO_MODE`               |     No | Public demo mode                |
| Render API      | `DATABASE_URL`                 |    Yes | Prisma runtime pooler URL       |
| Render API      | `REDIS_URL`                    |    Yes | Upstash Redis connection        |
| Render API      | `DEMO_SESSION_SECRET`          |    Yes | Demo session signing            |
| Render API      | `DEMO_TRIGGER_SECRET`          |    Yes | API to Demo API authentication  |
| Render API      | `DEMO_API_BASE_URL`            |     No | Demo API HTTPS URL              |
| Render API      | `DEMO_PROJECT_SLUG`            |     No | Demo project selector           |
| Render API      | `CORS_ALLOWED_ORIGINS`         |     No | Exact frontend origin           |
| Render API      | `RUN_REPLAY_WORKER`            |     No | Embedded worker switch          |
| Render API      | `ALLOW_PRIVATE_REPLAY_TARGETS` |     No | Must be false in production     |
| Render API      | `REPLAY_ALLOWED_HOSTS`         |     No | Replay hostname allowlist       |
| Render Demo API | `REQUESTLAB_API_URL`           |     No | RequestLab API URL              |
| Render Demo API | `REQUESTLAB_API_KEY`           |    Yes | SDK ingestion key               |
| Render Demo API | `DEMO_TRIGGER_SECRET`          |    Yes | Scenario trigger authentication |
| GitHub Actions  | `DATABASE_URL`                 |    Yes | Cleanup database connection     |
| GitHub Actions  | `DEMO_PROJECT_SLUG`            |     No | Cleanup project boundary        |

## Aşama 6B Checklist

This checklist is intentionally unapplied.

1. Commit and push the Aşama 6A changes.
2. Create the Render Demo API service.
3. Create the Render API service.
4. Add Supabase and Upstash secrets securely in Render.
5. Enable the embedded worker on the API.
6. Connect `demo.requestlab.yusufdere.com` to the Render Demo API service.
7. Connect `api.requestlab.yusufdere.com` to the Render API service.
8. Add the exact DNS records supplied by Render to the domain provider.
9. Update the demo environment base URL to the deployed Demo API URL.
10. Create the Vercel project from repository root.
11. Add Vercel production environment values.
12. Connect `requestlab.yusufdere.com` to Vercel.
13. Add the exact DNS record supplied by Vercel to the domain provider.
14. Verify HTTPS certificates are active.
15. Verify exact production CORS.
16. Create a public demo session.
17. Generate the `500` demo event.
18. View the event in the dashboard.
19. Verify sensitive event values are `[REDACTED]`.
20. Run replay.
21. Verify the `500 -> 201` comparison.
22. Verify rate limits, CSP, CORS, HTTPS, and cold-start behavior.
23. Run cleanup in dry-run mode first.
24. Add the real Live Demo URL to README.
25. Complete the LinkedIn video and sharing validation.

Do not guess CNAME targets. Use the exact values returned by Vercel and Render during deployment.

## Local Checks

- `corepack pnpm deploy:check` performs static/config and build validation without deployment.
- `corepack pnpm demo:cleanup --dry-run` requires an explicit `DEMO_PROJECT_SLUG` and the local safety opt-in `DEMO_CLEANUP_ALLOW_NON_PRODUCTION=true`.
- `corepack pnpm demo:cleanup` deletes only old event/replay/audit records in the configured demo project and never project configuration records.
