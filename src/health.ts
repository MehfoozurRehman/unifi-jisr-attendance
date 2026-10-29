import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from './config.js';
import type { JisrGateway, Probe, UnifiDirectory } from './domain.js';
import type { Store } from './store.js';

// The system health panel in Settings. Each check has a level and a message code with parameters;
// the dashboard words them in Arabic or English. Live checks call Jisr and UniFi read-only and are cached.
export type Level = 'ok' | 'warn' | 'fail' | 'off';
export type Group = 'jisr' | 'unifi' | 'system' | 'data';
export interface Check { id: string; group: Group; level: Level; code: string; params?: Record<string, string | number | string[] | null> }
export interface HealthReport { level: Level; checkedAt: number; liveCheckedAt: number; checks: Check[] }

const rank: Record<Level, number> = { off: 0, ok: 1, warn: 2, fail: 3 };
const LIVE_TTL_MS = 60_000;
const QUIET_MS = 24 * 3_600_000;
const startedAt = Date.now();

type Live = { at: number; jisr?: Awaited<ReturnType<NonNullable<JisrGateway['probe']>>>; unifi?: Awaited<ReturnType<NonNullable<UnifiDirectory['probe']>>> };
let live: Live | null = null, pending: Promise<Live> | null = null;

async function liveChecks(gateway: JisrGateway, unifi: UnifiDirectory | undefined, refresh: boolean, now: number): Promise<Live> {
  if (!refresh && live && now - live.at < LIVE_TTL_MS) return live;
  // Concurrent page loads share one round of probes.
  pending ??= Promise.all([gateway.probe?.(), unifi?.probe?.()]).then(([jisr, u]) => (live = { at: Date.now(), jisr, unifi: u })).finally(() => { pending = null; });
  return pending;
}

const probeCheck = (id: string, group: Group, probe: Probe | undefined, okCode: string, params: Check['params'] = {}): Check => {
  if (!probe) return { id, group, level: 'off', code: 'notChecked' };
  if (probe.ok) return { id, group, level: 'ok', code: okCode, params };
  if (probe.message === 'skipped') return { id, group, level: 'off', code: 'skippedAfterAuth' };
  return { id, group, level: 'fail', code: probe.message === 'notAuthorized' ? 'notAuthorized' : probe.message === 'authFailed' ? 'authFailed' : probe.status ? 'httpError' : 'unreachable', params: { status: probe.status, error: probe.status ? null : probe.message } };
};

export async function health(store: Store, config: Config, gateway: JisrGateway, unifi: UnifiDirectory | undefined, options: { refresh?: boolean; now?: number } = {}): Promise<HealthReport> {
  const now = options.now ?? Date.now();
  const { jisr, unifi: u, at } = await liveChecks(gateway, unifi, Boolean(options.refresh), now);
  const setting = (key: string) => store.setting(key);
  const one = <T>(sql: string, ...args: (string | number)[]) => store.db.prepare(sql).get(...args) as T;
  const checks: Check[] = [];

  // Jisr: sign-in and the two APIs the middleware needs, then the background employee sync.
  checks.push(probeCheck('jisr.auth', 'jisr', jisr?.auth, 'signedIn'));
  checks.push(probeCheck('jisr.employees', 'jisr', jisr?.employees, 'canRead'));
  checks.push(probeCheck('jisr.attendance', 'jisr', jisr?.attendance, 'canRead'));
  const syncedAt = Number(setting('employeesRefreshedAt') || 0), syncError = setting('employeeError');
  const jisrEmployees = one<{ n: number }>('SELECT count(*) AS n FROM employees WHERE active=1').n;
  if (syncError && (!syncedAt || Number(setting('employeeRetryAt') || 0) > syncedAt)) checks.push({ id: 'jisr.sync', group: 'jisr', level: 'fail', code: 'syncFailing', params: { error: syncError.replace(/^\w*Error:\s*/, ''), at: syncedAt || null } });
  else if (syncedAt) checks.push({ id: 'jisr.sync', group: 'jisr', level: 'ok', code: 'synced', params: { at: syncedAt, count: jisrEmployees } });
  else checks.push({ id: 'jisr.sync', group: 'jisr', level: 'warn', code: 'neverSynced' });

  // UniFi: the developer API (email lookup), people without an email, and whether webhooks are arriving.
  checks.push(probeCheck('unifi.api', 'unifi', u, 'reachable', { users: u?.users ?? null }));
  if (u?.ok) checks.push(u.withoutEmail.length ? { id: 'unifi.emails', group: 'unifi', level: 'warn', code: 'missingEmails', params: { count: u.withoutEmail.length, names: u.withoutEmail.slice(0, 8) } } : { id: 'unifi.emails', group: 'unifi', level: 'ok', code: 'allHaveEmail', params: { count: u.users } });
  else checks.push({ id: 'unifi.emails', group: 'unifi', level: 'off', code: 'skippedAfterApi' });
  const lastDelivery = one<{ at: number | null }>('SELECT max(receivedAt) AS at FROM deliveries').at;
  const lastError = one<{ n: number }>('SELECT count(*) AS n FROM deliveries WHERE error IS NOT NULL AND receivedAt>?', now - QUIET_MS).n;
  if (!lastDelivery) checks.push({ id: 'unifi.webhook', group: 'unifi', level: 'warn', code: 'noEvents' });
  else checks.push({ id: 'unifi.webhook', group: 'unifi', level: lastError ? 'warn' : now - lastDelivery > QUIET_MS ? 'warn' : 'ok', code: lastError ? 'badDeliveries' : now - lastDelivery > QUIET_MS ? 'quiet' : 'receiving', params: { at: lastDelivery, count: lastError } });

  // System: the background worker, the queue of punches, the database and the server itself.
  const tick = Number(setting('workerLastTick') || 0), paused = setting('paused') === 'true';
  const stalled = !tick || now - tick > Math.max(30_000, config.WORKER_INTERVAL_MS * 30);
  checks.push(paused ? { id: 'system.worker', group: 'system', level: 'warn', code: 'paused', params: { at: tick || null } } : stalled ? { id: 'system.worker', group: 'system', level: 'fail', code: 'stalled', params: { at: tick || null, error: setting('workerError') ?? null } } : { id: 'system.worker', group: 'system', level: 'ok', code: 'running', params: { at: tick } });
  const counts = store.counts(), stuck = (counts.held ?? 0) + (counts.failed ?? 0) + (counts.uncertain ?? 0);
  const waiting = one<{ n: number }>("SELECT count(*) AS n FROM events WHERE status IN ('queued','sending','submitted') AND receivedAt<?", now - 3_600_000).n;
  checks.push({ id: 'system.queue', group: 'system', level: counts.failed || counts.uncertain ? 'fail' : stuck || waiting ? 'warn' : 'ok', code: stuck || waiting ? 'needsAttention' : 'clear', params: { held: counts.held ?? 0, failed: counts.failed ?? 0, uncertain: counts.uncertain ?? 0, waiting, confirmed: counts.confirmed ?? 0 } });
  let size: number | null = null;
  try { size = statSync(config.DATABASE_PATH).size; } catch { /* in-memory or not created yet */ }
  try { one('SELECT 1'); checks.push({ id: 'system.database', group: 'system', level: 'ok', code: 'database', params: { size, events: Object.values(counts).reduce((a, b) => a + b, 0) } }); }
  catch (error) { checks.push({ id: 'system.database', group: 'system', level: 'fail', code: 'unreachable', params: { error: String(error) } }); }
  const memory = process.memoryUsage().rss;
  checks.push({ id: 'system.server', group: 'system', level: memory > 1_000_000_000 ? 'warn' : 'ok', code: 'server', params: { uptime: Math.round((now - startedAt) / 1000), node: process.version, memory } });

  // Data: the HR employee list, and badge holders whose taps do not match anyone on it.
  const listed = one<{ n: number }>('SELECT count(*) AS n FROM directory WHERE active=1').n;
  checks.push(listed ? { id: 'data.directory', group: 'data', level: 'ok', code: 'imported', params: { count: listed, at: Number(setting('directoryImportedAt') || 0) || null } } : { id: 'data.directory', group: 'data', level: 'warn', code: 'notImported' });
  if (listed) {
    const unmatched = store.db.prepare("SELECT max(name) AS name FROM events WHERE email IS NOT NULL AND lower(email) NOT IN (SELECT lower(email) FROM directory WHERE email IS NOT NULL) GROUP BY lower(email) ORDER BY max(receivedAt) DESC").all() as { name: string | null }[];
    checks.push(unmatched.length ? { id: 'data.unmatched', group: 'data', level: 'warn', code: 'unmatched', params: { count: unmatched.length, names: unmatched.slice(0, 8).map(r => r.name || '?') } } : { id: 'data.unmatched', group: 'data', level: 'ok', code: 'allMatched' });
  }
  const brand = existsSync(join(process.cwd(), 'brand', 'logo-white-crop.png'));
  checks.push({ id: 'data.brand', group: 'data', level: brand ? 'ok' : 'warn', code: brand ? 'brandFound' : 'brandMissing' });

  const level = checks.reduce<Level>((worst, c) => (rank[c.level] > rank[worst] ? c.level : worst), 'ok');
  return { level, checkedAt: now, liveCheckedAt: at, checks };
}
