import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Hono } from 'hono';
import type { Config } from './config.js';
import { Store } from './store.js';
import { Worker } from './worker.js';

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
  app.get('/assets/*', c => { try { const root = resolve(publicDir); const path = resolve(root, `.${c.req.path}`); if (!path.startsWith(`${root}\\`) && !path.startsWith(`${root}/`)) return c.notFound(); const content = readFileSync(path); return new Response(content, { headers: { 'Content-Type': path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable' } }); } catch { return c.notFound(); } });
  app.get('*', c => { try { return c.html(readFileSync(join(publicDir, 'index.html'), 'utf8')); } catch { return c.text('Dashboard build missing', 503); } });
  return app;
}
