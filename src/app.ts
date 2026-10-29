import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Hono } from 'hono';
import type { Config } from './config.js';
import { Store } from './store.js';
import { Worker } from './worker.js';
import { Attendance } from './attendance.js';
import { analyze, contributions } from './analytics.js';

const rules = (config: Config) => ({ workStartMinutes: config.WORK_START_MINUTES, lateGraceMinutes: config.LATE_GRACE_MINUTES, requiredMinutes: config.REQUIRED_MINUTES, weekendDays: config.WEEKEND_DAYS });

const digest = (value: string) => createHash('sha256').update(value).digest();
const same = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));
const cookie = (header: string, key: string) => header.split(';').map(v => v.trim().split('=')).find(([k]) => k === key)?.[1] ?? '';

export function createApp(store: Store, worker: Worker, config: Config, publicDir = join(process.cwd(), 'public')) {
  const app = new Hono();
  const authenticated = (c: any) => store.validSession(cookie(c.req.header('cookie') || '', 'attendance_session'), Date.now());
  app.get('/health', c => c.json({ ok: true, database: true, paused: store.setting('paused') === 'true', workerLastTick: Number(store.setting('workerLastTick') || 0), employeeError: store.setting('employeeError') || null }));
  const webhook = async (c: any) => {
    const supplied = (c.req.header('authorization') || '').replace(/^Bearer\s+/i, '') || c.req.header('x-webhook-secret') || c.req.query('secret') || '';
    if (!same(supplied, config.UNIFI_WEBHOOK_SECRET)) return c.json({ ok: false }, 401);
    const raw = await c.req.text();
    const result = store.ingest(raw, Date.now(), config);
    void worker.tick();
    return c.json({ ok: true, deliveryId: result.deliveryId, accepted: result.eventIds.length }, result.malformed ? 400 : 202);
  };
  app.post('/api/webhook/unifi', webhook);
  app.post('/api/webhooks/unifi', webhook);
  app.post('/api/login', async c => {
    const body = await c.req.json().catch(() => ({}));
    if (!same(String(body.password || ''), config.DASHBOARD_PASSWORD)) return c.json({ ok: false }, 401);
    const token = randomBytes(32).toString('hex');
    store.session(token, Date.now() + config.SESSION_TTL_MS);
    c.header('Set-Cookie', `attendance_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(config.SESSION_TTL_MS / 1000)}`);
    return c.json({ ok: true });
  });
  app.post('/api/logout', c => { const token = cookie(c.req.header('cookie') || '', 'attendance_session'); if (token) store.deleteSession(token); c.header('Set-Cookie', 'attendance_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'); return c.json({ ok: true }); });
  app.use('/api/admin/*', async (c, next) => authenticated(c) ? next() : c.json({ error: 'Unauthorized' }, 401));
  app.get('/api/admin/summary', c => c.json({ counts: store.counts(), paused: store.setting('paused') === 'true', employeesRefreshedAt: Number(store.setting('employeesRefreshedAt') || 0), employeeError: store.setting('employeeError') || null, workerLastTick: Number(store.setting('workerLastTick') || 0) }));
  app.get('/api/admin/events', c => { const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') || 50))); return c.json(store.list({ status: c.req.query('status'), q: c.req.query('q'), limit, offset: Math.max(0, Number(c.req.query('offset') || 0)) })); });
  app.get('/api/admin/events/:id', c => { const event = store.event(Number(c.req.param('id'))); return event ? c.json({ event, attempts: store.attempts(event.id) }) : c.json({ error: 'Not found' }, 404); });
  app.get('/api/admin/employees', c => c.json(store.employees(c.req.query('q') || '')));
  app.post('/api/admin/map', async c => { const body = await c.req.json(); try { store.map(Number(body.eventId), String(body.employeeId)); return c.json({ ok: true }); } catch (error) { return c.json({ error: String(error) }, 400); } });
  app.post('/api/admin/events/:id/retry', c => { store.retry(Number(c.req.param('id')), Date.now()); void worker.tick(); return c.json({ ok: true }); });
  app.post('/api/admin/pause', async c => { const body = await c.req.json(); store.set('paused', String(Boolean(body.paused))); return c.json({ ok: true }); });
  const attendance = new Attendance(store, config);
  const period = (value: string | undefined, fallback: number, min: number, max: number) => { const n = Number(value); return Number.isInteger(n) && n >= min && n <= max ? n : fallback; };
  const nowParts = () => { const [y, m] = new Intl.DateTimeFormat('en-CA', { timeZone: config.TIMEZONE, year: 'numeric', month: '2-digit' }).format(new Date()).split('-').map(Number); return { y, m }; };
  app.get('/api/admin/people', c => c.json(attendance.people(c.req.query('q') || '')));
  app.get('/api/admin/attendance/month', c => { const { y, m } = nowParts(); const key = (c.req.query('person') || '').toLowerCase(); if (!key) return c.json({ error: 'person is required' }, 400); return c.json({ days: attendance.month(key, period(c.req.query('year'), y, 2020, 2100), period(c.req.query('month'), m, 1, 12)), rules: rules(config) }); });
  app.get('/api/admin/attendance/year', c => { const { y } = nowParts(); const key = (c.req.query('person') || '').toLowerCase(); if (!key) return c.json({ error: 'person is required' }, 400); return c.json({ months: attendance.year(key, period(c.req.query('year'), y, 2020, 2100)), rules: rules(config) }); });
  app.get('/api/admin/attendance/team', c => { const { y, m } = nowParts(); return c.json({ rows: attendance.team(period(c.req.query('year'), y, 2020, 2100), period(c.req.query('month'), m, 1, 12)), rules: rules(config) }); });
  // Range analytics: from/to are Riyadh calendar dates (YYYY-MM-DD), inclusive, at most ~13 months apart.
  const range = (c: any) => {
    const valid = (v: string | undefined) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: config.TIMEZONE }).format(new Date());
    const to = valid(c.req.query('to')) ? c.req.query('to') : today;
    const fallback = new Date(Date.parse(`${to}T12:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10);
    let from = valid(c.req.query('from')) ? c.req.query('from') : fallback;
    if (from > to) from = to;
    if (Date.parse(to) - Date.parse(from) > 400 * 86_400_000) from = new Date(Date.parse(`${to}T12:00:00Z`) - 400 * 86_400_000).toISOString().slice(0, 10);
    return { from: from as string, to: to as string };
  };
  app.get('/api/admin/analytics', c => { const { from, to } = range(c); return c.json({ ...analyze(attendance, config, from, to, null), rules: rules(config) }); });
  app.get('/api/admin/analytics/person', c => { const key = (c.req.query('person') || '').toLowerCase(); if (!key) return c.json({ error: 'person is required' }, 400); const { from, to } = range(c); return c.json({ ...analyze(attendance, config, from, to, key), rules: rules(config) }); });
  app.get('/api/admin/contributions', c => { const key = (c.req.query('person') || '').toLowerCase() || null; const { to } = range(c); return c.json(contributions(attendance, config, to, key)); });
  // Brand files (logo, licensed fonts) live outside the repository in ./brand and are optional.
  app.get('/brand/*', c => { try { const root = resolve(join(process.cwd(), 'brand')); const path = resolve(root, `.${c.req.path.slice('/brand'.length)}`); if (!path.startsWith(`${root}\\`) && !path.startsWith(`${root}/`)) return c.notFound(); return new Response(readFileSync(path), { headers: { 'Content-Type': path.endsWith('.png') ? 'image/png' : path.endsWith('.svg') ? 'image/svg+xml' : path.endsWith('.ttf') ? 'font/ttf' : path.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream', 'Cache-Control': 'public, max-age=86400' } }); } catch { return c.notFound(); } });
  app.get('/assets/*', c => { try { const root = resolve(publicDir); const path = resolve(root, `.${c.req.path}`); if (!path.startsWith(`${root}\\`) && !path.startsWith(`${root}/`)) return c.notFound(); const content = readFileSync(path); return new Response(content, { headers: { 'Content-Type': path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable' } }); } catch { return c.notFound(); } });
  app.get('*', c => { try { return c.html(readFileSync(join(publicDir, 'index.html'), 'utf8')); } catch { return c.text('Dashboard build missing', 503); } });
  return app;
}
