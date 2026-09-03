# UniFi Access to Jisr HR Attendance Middleware

High-performance attendance synchronization middleware built with **Hono** and **TypeScript**, specifically designed for seamless deployment on **Railway** (or Docker).

This service receives real-time NFC / card swipe events from **UniFi Access**, correlates employees with **Jisr HRMS** by matching work email addresses, determines punch direction (Check-In vs. Check-Out), and automatically records attendance logs into Jisr.

---

## 📋 Architecture & Data Flow

```
UniFi Access (Card Reader Swipe)
       │
       ▼ (Webhook: access.door.unlock)
Railway Deployment (`POST /api/webhooks/unifi`)
       ├── 1. Validates webhook token / secret
       ├── 2. Ignores rejected/failed attempts
       ├── 3. De-duplicates rapid double-swipes
       ├── 4. Resolves employee by email
       ├── 5. Determines IN vs OUT based on reader/door name
       └── 6. Pushes punch to Jisr API (`POST /api/attendance/logs`)
```

---

## 🚀 Quick Setup & Deployment to Railway

### 1. Push to GitHub
Deploy directly by connecting this repository to Railway:
1. Go to [Railway.app](https://railway.app).
2. Click **New Project** > **Deploy from GitHub repo** and select this repo.
3. Railway will automatically detect the `Dockerfile` and build the container.

### 2. Configure Environment Variables in Railway
Under your Railway project **Variables** tab, set:

| Variable | Description | Example / Default |
|---|---|---|
| `PORT` | Container listening port (Railway sets this automatically) | `3000` |
| `NODE_ENV` | Environment mode | `production` |
| `JISR_HOST_TYPE` | Jisr server type | `cloud` (or `local` if Saudi hosted) |
| `JISR_API_KEY` | **Required**: Jisr Open API Key / Bearer Token | `your_jisr_api_key` |
| `UNIFI_WEBHOOK_SECRET` | Secret token to authenticate UniFi webhook requests | `super_secret_token_123` |
| `UNIFI_BASE_URL` | *(Optional)* UniFi console URL for user lookups | `https://udm.local:12445` |
| `UNIFI_API_TOKEN` | *(Optional)* UniFi developer API token | `your_unifi_token` |
| `DEDUPLICATION_WINDOW_SECONDS` | Ignore rapid repeat swipes from same user | `60` |
| `IN_KEYWORDS` | Keywords to classify reader/door as IN | `in,entry,entrance,check-in` |
| `OUT_KEYWORDS` | Keywords to classify reader/door as OUT | `out,exit,departure,check-out` |
| `DEFAULT_DIRECTION` | Fallback direction if keyword not matched | `in` |

---

## 🔑 What You Need from Jisr

1. **Host Environment**:
   - If the client's Jisr portal URL has `.jisr.net.sa`, set `JISR_HOST_TYPE=local` (`https://api.jisr.net.sa/api`).
   - If the client's Jisr portal URL has `.jisr.net`, set `JISR_HOST_TYPE=cloud` (`https://apis.jisr.net/api`).
2. **API Key / Access Token**:
   - Request an Open API Key from the Jisr account manager or portal: **Settings > Integrations > API Keys / Open API**.
   - Ensure the API key has permissions for:
     - `Employees` (Read employee list and emails)
     - `Attendance` / `Attendance Logs` (Write/push attendance punches)

---

## 🚪 What You Need from UniFi Access

1. **Deploying on Railway (Public Webhook)**:
   - Your Railway service URL will be something like:
     `https://unifi-jisr-attendance-production.up.railway.app`
   - The webhook endpoint to register in UniFi is:
     `https://unifi-jisr-attendance-production.up.railway.app/api/webhooks/unifi`
2. **Configure Webhook in UniFi Console**:
   - Go to your UniFi Console -> **Access Application** -> **Settings** -> **General** -> **API / Webhooks**.
   - Create a new webhook:
     - **URL**: `https://<YOUR_RAILWAY_DOMAIN>/api/webhooks/unifi`
     - **Secret / Header**: Set Authorization Header: `Bearer <UNIFI_WEBHOOK_SECRET>`
     - **Trigger Events**: Select `access.door.unlock` (and Door Unlock logs).
3. **Reader / Door Naming for In / Out Detection**:
   - Make sure your readers or doors include descriptive names so the service knows whether someone is entering or leaving:
     - E.g., `Main Entrance - Entry`, `Turnstile 1 - IN`, `Back Door - Exit`, `Office Door OUT`.
   - The keywords can be customized using `IN_KEYWORDS` and `OUT_KEYWORDS`.

---

## 🧪 Testing & Verification

- **Health Check**:
  ```bash
  curl https://<YOUR_RAILWAY_DOMAIN>/health
  ```
- **Simulate Test Punch (without UniFi hardware)**:
  ```bash
  curl -X POST https://<YOUR_RAILWAY_DOMAIN>/api/admin/test-punch \
    -H "Content-Type: application/json" \
    -d '{ "email": "employee@yourcompany.com", "direction": "in", "door": "Main Entrance" }'
  ```
- **Force Refresh Jisr Employee Directory**:
  ```bash
  curl -X POST https://<YOUR_RAILWAY_DOMAIN>/api/admin/refresh-jisr-cache
  ```

---

## 💻 Local Development

```bash
# 1. Install dependencies
npm install

# 2. Copy environment template
cp .env.example .env

# 3. Start development server with hot-reload
npm run dev

# 4. Run tests
npm test

# 5. Build for production
npm run build
```
