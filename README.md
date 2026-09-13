# UniFi → Jisr Attendance

One Railway service receives UniFi Access events, stores every delivery in SQLite, processes validated physical-access events in order, submits them to Jisr, and serves the React operations dashboard.

## Production deployment

Deploy the repository using its Dockerfile. The service listens on port `3000`. Add a Railway persistent volume mounted at `/app/data`; the attendance database is `/app/data/attendance.sqlite`. Run exactly one replica because SQLite and the ordered punch worker are intentionally single-writer.

The existing UniFi webhook can continue using either endpoint:

- `POST /api/webhook/unifi`
- `POST /api/webhooks/unifi`

The webhook secret and all integration values are defined directly in `src/config.ts`, as requested. No environment variables are read.

Open the service domain to use the dashboard. It shows the event time in `Asia/Riyadh`, the source direction, matching decision, queue state, Jisr submission state, and final confirmation. Held events are never guessed or submitted automatically.

## Processing rules

- Every HTTP delivery and every item in a UniFi batch is committed before processing.
- UniFi Unix timestamps are treated as source instants; receipt time is never substituted.
- `entered` is IN and `exited` is OUT.
- FACE, NFC, PIN, wallet NFC, and mobile tap are physical attendance credentials.
- Remote button, call, administrative, emergency, failed, malformed, stale, future, or ambiguous events are retained but not punched.
- Repeated identical source events are deduplicated permanently.
- Repeated same-direction events are skipped until an opposite-direction event occurs.
- Opposite-direction events are preserved even when they occur seconds apart.
- Employee matching uses a permanent UniFi mapping, exact email, exact full name, or a unique multi-part name match. Ambiguous names are held.
- A network interruption during submission moves the punch to reconciliation. It is never blindly resent.
- A punch is only marked confirmed after Jisr reports it as successful.

When an employee cannot be matched safely, use **Match employee** on the held event. The dashboard stores a permanent UniFi-user-to-Jisr-employee mapping and retries that event through the normal protected queue.

## Local verification

The test suite uses in-memory SQLite and a fake Jisr gateway. It never contacts the real company integrations.

```powershell
npm install
npm test
npm run build
```

For frontend development, run `npm run dev:server` and `npm run dev` in separate terminals. Do not send fabricated events to the production webhook.

## Backup

The Railway volume contains the complete operational ledger. Back up `/app/data/attendance.sqlite` together with its WAL files using a volume snapshot or a SQLite online backup. Never deploy without the persistent volume.
