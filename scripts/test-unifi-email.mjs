// Usage: node scripts/test-unifi-email.mjs [userId ...]
// Env: UNIFI_BASE_URL (default https://192.168.8.1), UNIFI_API_TOKEN or UNIFI_API_TOKEN_FILE.
// Lists UniFi Access users through the local Developer API and reports how many have an email.
import { readFileSync } from 'node:fs';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // controller uses a self-signed certificate

const base = (process.env.UNIFI_BASE_URL || 'https://192.168.8.1').replace(/\/$/, '');
const host = base.replace(/:\d+$/, '');
const token = process.env.UNIFI_API_TOKEN || (process.env.UNIFI_API_TOKEN_FILE ? readFileSync(process.env.UNIFI_API_TOKEN_FILE, 'utf8').trim() : '');
if (!token) { console.error('Set UNIFI_API_TOKEN or UNIFI_API_TOKEN_FILE'); process.exit(2); }

const mask = (email) => email ? email.replace(/^(.{2}).*(@.*)$/, '$1***$2') : '(none)';
const get = async (url) => {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
  const text = await response.text();
  let body = null; try { body = JSON.parse(text); } catch { body = text; }
  return { status: response.status, body };
};

const api = `${host}:12445/api/v1/developer`;
const users = [];
for (let page = 1; page <= 50; page++) {
  const { status, body } = await get(`${api}/users?page_num=${page}&page_size=100`);
  if (status !== 200) { console.error(`users page ${page}: HTTP ${status}`, JSON.stringify(body).slice(0, 200)); process.exit(1); }
  const rows = body?.data ?? [];
  users.push(...rows);
  if (rows.length < 100) break;
}
const withEmail = users.filter((u) => String(u.user_email ?? u.email ?? '').includes('@'));
console.log(`UniFi users: ${users.length}, with email: ${withEmail.length}, without: ${users.length - withEmail.length}`);
console.log('Sample fields:', Object.keys(users[0] ?? {}).join(', '));
for (const u of users.slice(0, 5)) console.log(` - ${u.id}  ${u.first_name ?? ''} ${u.last_name ?? ''}  ${mask(u.user_email ?? u.email)}`);

for (const id of process.argv.slice(2)) {
  const { status, body } = await get(`${api}/users/${id}`);
  const data = body?.data ?? body;
  console.log(`single lookup ${id}: HTTP ${status}  ${data?.first_name ?? ''} ${data?.last_name ?? ''}  ${mask(data?.user_email ?? data?.email)}`);
}
