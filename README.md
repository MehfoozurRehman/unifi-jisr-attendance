# UniFi to Jisr Attendance

A single-service middleware that turns UniFi Access events into ordered, auditable Jisr HR punches, with a React dashboard for operators.

## The problem

Physical-access logs are noisy. They include remote unlocks, alarms, retries, duplicate deliveries and events that arrive out of order. Forwarding every event as a punch produces wrong attendance records. This service keeps every delivery, applies strict rules about which events count as attendance, submits only the ones that qualify, and holds anything ambiguous for a person to resolve.

## What it does

- **Durable intake.** UniFi posts to `POST /api/webhook/unifi` (or `/api/webhooks/unifi`). Every HTTP delivery and every item in a batch is committed to SQLite before processing starts.
- **Event classification.** FACE, NFC, PIN, wallet NFC and mobile tap are treated as physical credentials and can produce punches. Remote, call, administrative, emergency, failed, malformed, stale, future or ambiguous events are kept but not punched.
- **Direction rules.** `entered` is IN and `exited` is OUT. A repeated same-direction event is skipped until an opposite-direction event occurs, and identical source events are deduplicated permanently.
- **Email-based matching with manual resolution.** Employees are matched by email only. An event without an email is held, and an operator can enter the Jisr email on the dashboard. The event is then retried through the normal queue.
- **Safe submission.** A single ordered worker submits punches to Jisr. A network failure during submission moves the punch into reconciliation rather than resending it. A punch is marked confirmed only after Jisr reports success.
- **Operations dashboard.** Shows event time in `Asia/Riyadh`, source direction, matching decision, queue state and Jisr confirmation. It includes a pause control, per-event retry, and a session login backed by an HttpOnly cookie.

## How it's built

- **Runtime:** TypeScript on Node with Hono (`@hono/node-server`). One process serves the API, runs the worker and serves the built React dashboard.
- **Persistence:** SQLite through Node's built-in `node:sqlite` (`DatabaseSync`) in `src/store.ts`. The database lives at `/app/data/attendance.sqlite` in the container.
- **Frontend:** React 19 and Vite, with `client/` as the dashboard source.
- **Integration clients:** `src/unifi.ts` and `src/jisr.ts`. Parsing and name normalisation live in `src/normalize.ts`. The attendance rules are in `src/domain.ts`.
- **Container:** a two-stage Dockerfile on `node:24-alpine`. The build stage compiles everything, and the runtime stage installs production dependencies only.

Two decisions shape the design:

1. **Single writer by design.** The worker processes punches in order, on a timer set up in `src/index.ts`. Running more than one replica would break that ordering, so the deployment runs one instance.
2. **Prefer holding to guessing.** Ambiguous events are held and never submitted automatically. The cost is manual work for the operator. The benefit is that no punch is recorded on a guess.

## Running it locally

```bash
npm install
npm test              # vitest; in-memory SQLite and a fake Jisr gateway
npm run build         # builds the dashboard, then type-checks with tsc
npm run dev:server    # API with tsx watch on src/index.ts
npm run dev           # Vite dev server for the dashboard
npm run local         # runs src/local.ts
npm start             # node dist/index.js (after build)
```

The test suite never contacts the real UniFi or Jisr services.

## What I learned / what I'd do next

- Configuration is read from environment variables, with fallback defaults in `src/config.ts`. Those fallbacks currently include credential values, which should be removed from source and rotated.
- The earlier README said no environment variables were read. That was not accurate, and this version describes the actual behaviour.
- There is one test file, `src/overhaul.test.ts`, with 14 cases. Adding coverage for the HTTP routes in `src/app.ts` and for the Jisr client would reduce regression risk.
- The dashboard login uses a single shared password (`DASHBOARD_PASSWORD`). Per-operator accounts would give an audit trail of who held, retried or mapped each event.
- The Dockerfile has no `USER` directive, so the container runs as root. Adding a non-root user is a small hardening step.
