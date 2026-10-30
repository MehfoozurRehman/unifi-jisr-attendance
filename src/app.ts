import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Hono } from 'hono';
import type { Config } from './config.js';
import { Store } from './store.js';
import { Worker } from './worker.js';
import { Attendance } from './attendance.js';
import { analyze, contributions, members, type Scope } from './analytics.js';
import { authenticate, clearFailures, ensureStaff, listStaff, loginBlocked, recordFailure } from './staff.js';
import { directory, ensureDirectory, functionNames, parseEmployeeWorkbook, saveDirectory } from './directory.js';
import { getHolidays, getRules, saveHolidays, saveRules, withRules } from './rules.js';
import { health } from './health.js';


const digest = (value: string) => createHash('sha256').update(value).digest();
const same = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));
const cookie = (header: string, key: string) => header.split(';').map(v => v.trim().split('=')).find(([k]) => k === key)?.[1] ?? '';

export function createApp(store: Store, worker: Worker, config: Config, publicDir = join(process.cwd(), 'public')) {
  const app = new Hono();
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
  ensureStaff(store); ensureDirectory(store);
  app.post('/api/login', async c => {
    const body = await c.req.json().catch(() => ({}));
    const username = String(body.username || 'admin').trim().toLowerCase(), password = String(body.password || '');
    const address = c.req.header('x-forwarded-for')?.split(',')[0].trim() || 'local';
    const keys = [`u:${username}`, `a:${address}`];
    if (loginBlocked(keys)) return c.json({ ok: false, error: 'Too many attempts. Try again in 15 minutes.' }, 429);
    const user = authenticate(store, username, password, config.DASHBOARD_PASSWORD);
    if (!user) { recordFailure(keys); return c.json({ ok: false }, 401); }
    clearFailures(keys);
    const token = randomBytes(32).toString('hex');
    store.session(token, Date.now() + config.SESSION_TTL_MS, user.username, user.role);
    c.header('Set-Cookie', `attendance_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(config.SESSION_TTL_MS / 1000)}`);
    return c.json({ ok: true, user });
  });
  app.post('/api/logout', c => { const token = cookie(c.req.header('cookie') || '', 'attendance_session'); if (token) store.deleteSession(token); c.header('Set-Cookie', 'attendance_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'); return c.json({ ok: true }); });
  const sessionOf = (c: any) => store.sessionUser(cookie(c.req.header('cookie') || '', 'attendance_session'), Date.now());
  app.use('/api/admin/*', async (c, next) => { const user = sessionOf(c); if (!user) return c.json({ error: 'Unauthorized' }, 401); c.set('user' as never, user as never); return next(); });
  // The raw event ledger, Jisr mapping, processing control and data import are for admins; HR sees analytics.
  const adminOnly = async (c: any, next: () => Promise<void>) => { const user = sessionOf(c); if (user?.role !== 'admin') return c.json({ error: 'Admins only' }, 403); return next(); };
  for (const path of ['/api/admin/events', '/api/admin/events/*', '/api/admin/map', '/api/admin/pause', '/api/admin/employees', '/api/admin/directory/import', '/api/admin/staff']) app.use(path, adminOnly);
  app.get('/api/admin/me', c => { const user = sessionOf(c)!; const staff = listStaff(store).find(s => s.username === user.username); return c.json({ username: user.username, role: user.role, displayName: staff?.displayName ?? (user.username === 'admin' ? 'Administrator' : user.username), bootstrap: !listStaff(store).length }); });
  app.get('/api/admin/staff', c => c.json(listStaff(store)));
  app.get('/api/admin/directory', c => c.json({ employees: directory(store), functions: functionNames(store), importedAt: Number(store.setting('directoryImportedAt') || 0) }));
  app.post('/api/admin/directory/import', async c => {
    const body = await c.req.arrayBuffer();
    if (!body.byteLength || body.byteLength > 5 * 1024 * 1024) return c.json({ error: 'Upload an .xlsx file under 5 MB' }, 400);
    try { const { entries, functions } = await parseEmployeeWorkbook(body); return c.json({ ok: true, ...saveDirectory(store, entries, functions, Date.now()) }); }
    catch (error) { return c.json({ error: error instanceof Error ? error.message : 'Could not read the workbook' }, 400); }
  });
  app.get('/api/admin/summary', c => c.json({ counts: store.counts(), paused: store.setting('paused') === 'true', employeesRefreshedAt: Number(store.setting('employeesRefreshedAt') || 0), employeeError: store.setting('employeeError') || null, workerLastTick: Number(store.setting('workerLastTick') || 0) }));
  app.get('/api/admin/events', c => { const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') || 50))); return c.json(store.list({ status: c.req.query('status'), q: c.req.query('q'), limit, offset: Math.max(0, Number(c.req.query('offset') || 0)) })); });
  app.get('/api/admin/events/:id', c => { const event = store.event(Number(c.req.param('id'))); return event ? c.json({ event, attempts: store.attempts(event.id) }) : c.json({ error: 'Not found' }, 404); });
  app.get('/api/admin/employees', c => c.json(store.employees(c.req.query('q') || '')));
  app.post('/api/admin/map', async c => { const body = await c.req.json(); try { store.map(Number(body.eventId), String(body.employeeId)); return c.json({ ok: true }); } catch (error) { return c.json({ error: String(error) }, 400); } });
  app.post('/api/admin/events/:id/retry', c => { store.retry(Number(c.req.param('id')), Date.now()); void worker.tick(); return c.json({ ok: true }); });
  app.post('/api/admin/pause', async c => { const body = await c.req.json(); store.set('paused', String(Boolean(body.paused))); return c.json({ ok: true }); });
  const attendance = new Attendance(store, config);
  app.get('/api/admin/people', c => { const q = (c.req.query('q') || '').trim().toLowerCase(); return c.json(members(store, attendance).filter(m => !q || `${m.name} ${m.nameAr ?? ''} ${m.email ?? ''} ${m.employeeId ?? ''} ${m.department ?? ''}`.toLowerCase().includes(q)).slice(0, 20)); });
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
  // Scope: ?person=<email or employee id> | ?department=<name> | ?function=<name>; none = whole company.
  const scopeOf = (c: any): Scope => { const v = (k: string) => (c.req.query(k) || '').trim() || undefined; const person = v('person'); return { person: person && person.includes('@') ? person.toLowerCase() : person, department: v('department'), fn: v('function') }; };
  // Work rules (start time, grace, required hours, weekend) are edited in the dashboard and apply to every view.
  // So are holidays, company-wide or for chosen departments.
  const ruled = () => { const r = getRules(store, config); return { rules: r, config: withRules(config, r, getHolidays(store)) }; };
  app.get('/api/admin/analytics', c => { const { from, to } = range(c); const { rules, config: cfg } = ruled(); return c.json({ ...analyze(store, attendance, cfg, from, to, scopeOf(c)), rules, functionNames: functionNames(store) }); });
  app.get('/api/admin/contributions', c => { const { to } = range(c); return c.json(contributions(store, attendance, ruled().config, to, scopeOf(c))); });
  app.get('/api/admin/settings/rules', c => c.json(getRules(store, config)));
  app.put('/api/admin/settings/rules', async c => {
    try { return c.json({ ok: true, rules: saveRules(store, await c.req.json()) }); } catch (error) { return c.json({ error: error instanceof Error ? error.message : 'Invalid rules' }, 400); }
  });
  app.get('/api/admin/settings/holidays', c => c.json({ holidays: getHolidays(store), departments: [...new Set(directory(store).filter(e => e.active && e.department).map(e => e.department!))].sort() }));
  app.put('/api/admin/settings/holidays', async c => {
    try { return c.json({ ok: true, holidays: saveHolidays(store, (await c.req.json())?.holidays) }); } catch (error) { return c.json({ error: error instanceof Error ? error.message : 'Invalid holidays' }, 400); }
  });
  // System health for the Settings page; ?refresh=1 re-runs the live Jisr and UniFi checks (otherwise cached for a minute).
  app.get('/api/admin/health', async c => c.json(await health(store, config, worker.gateway, worker.unifi, { refresh: c.req.query('refresh') === '1' })));
  // Brand files (logo, licensed fonts) live outside the repository in ./brand and are optional.
  app.get('/brand/*', c => { try { const root = resolve(join(process.cwd(), 'brand')); const path = resolve(root, `.${c.req.path.slice('/brand'.length)}`); if (!path.startsWith(`${root}\\`) && !path.startsWith(`${root}/`)) return c.notFound(); return new Response(readFileSync(path), { headers: { 'Content-Type': path.endsWith('.png') ? 'image/png' : path.endsWith('.svg') ? 'image/svg+xml' : path.endsWith('.ttf') ? 'font/ttf' : path.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream', 'Cache-Control': 'public, max-age=86400' } }); } catch { return c.notFound(); } });
  app.get('/assets/*', c => { try { const root = resolve(publicDir); const path = resolve(root, `.${c.req.path}`); if (!path.startsWith(`${root}\\`) && !path.startsWith(`${root}/`)) return c.notFound(); const content = readFileSync(path); return new Response(content, { headers: { 'Content-Type': path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable' } }); } catch { return c.notFound(); } });
  app.get('*', c => { try { return c.html(readFileSync(join(publicDir, 'index.html'), 'utf8')); } catch { return c.text('Dashboard build missing', 503); } });
  return app;
}
