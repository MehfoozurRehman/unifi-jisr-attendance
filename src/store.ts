import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Config } from './config.js';
import type { Employee, EventRow, EventStatus, Punch } from './domain.js';
import { hash, normalize, normalizePersonName, splitEvents } from './normalize.js';

export class Store {
  readonly db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS deliveries(id INTEGER PRIMARY KEY AUTOINCREMENT, receivedAt INTEGER NOT NULL, raw TEXT NOT NULL, error TEXT);
      CREATE TABLE IF NOT EXISTS events(
        id INTEGER PRIMARY KEY AUTOINCREMENT, deliveryId INTEGER NOT NULL REFERENCES deliveries(id), receivedAt INTEGER NOT NULL,
        raw TEXT NOT NULL, sourceId TEXT, fingerprint TEXT NOT NULL, occurredAt INTEGER, timeSource TEXT, sourceTime TEXT,
        userId TEXT, email TEXT, name TEXT, readerId TEXT, door TEXT, direction TEXT, directionSource TEXT,
        status TEXT NOT NULL, reason TEXT NOT NULL, employeeId TEXT, employeeCode TEXT, employeeName TEXT,
        duplicateOf INTEGER REFERENCES events(id), punchId INTEGER UNIQUE, request TEXT, nextAttemptAt INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0, updatedAt INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS event_fingerprint ON events(fingerprint);
      CREATE INDEX IF NOT EXISTS event_queue ON events(status,nextAttemptAt,occurredAt);
      CREATE INDEX IF NOT EXISTS event_employee ON events(employeeId,occurredAt);
      CREATE TABLE IF NOT EXISTS employees(id TEXT PRIMARY KEY, code TEXT NOT NULL, email TEXT, name TEXT NOT NULL, active INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS attempts(id INTEGER PRIMARY KEY AUTOINCREMENT, eventId INTEGER NOT NULL REFERENCES events(id), at INTEGER NOT NULL, kind TEXT NOT NULL, outcome TEXT NOT NULL, detail TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, expiresAt INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS identity_mappings(userId TEXT PRIMARY KEY, employeeId TEXT NOT NULL REFERENCES employees(id));
      PRAGMA user_version=1;`);
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  ingest(raw: string, now: number, config: Config) {
    let payload: unknown, error: string | null = null;
    try { payload = JSON.parse(raw); } catch { error = 'Invalid JSON'; }
    return this.transaction(() => {
      const deliveryId = Number(this.db.prepare('INSERT INTO deliveries(receivedAt,raw,error) VALUES(?,?,?)').run(now, raw, error).lastInsertRowid);
      const ids: number[] = [];
      for (const entry of error ? [null] : splitEvents(payload)) {
        const n = normalize(entry, now, config);
        if (error) { n.status = 'held'; n.reason = 'Malformed JSON delivery retained for inspection'; n.fingerprint = hash(['malformed', raw]); }
        const previous = this.db.prepare('SELECT id FROM events WHERE fingerprint=? ORDER BY id LIMIT 1').get(n.fingerprint) as {id: number} | undefined;
        if (previous) { n.status = 'duplicate'; n.reason = `Repeated source event; original #${previous.id}`; }
        const row = { deliveryId, receivedAt: now, raw: JSON.stringify(entry), ...n, duplicateOf: previous?.id ?? null, nextAttemptAt: now + config.REORDER_WINDOW_MS, updatedAt: now };
        const keys = Object.keys(row);
        const result = this.db.prepare(`INSERT INTO events(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`).run(...Object.values(row));
        ids.push(Number(result.lastInsertRowid));
      }
      return { deliveryId, eventIds: ids, malformed: Boolean(error) };
    });
  }
  event(id: number): EventRow | undefined { return this.db.prepare('SELECT * FROM events WHERE id=?').get(id) as unknown as EventRow | undefined; }
  update(id: number, changes: Partial<EventRow>, now: number) {
    const data = { ...changes, updatedAt: now };
    const keys = Object.keys(data);
    this.db.prepare(`UPDATE events SET ${keys.map(k => `${k}=?`).join(',')} WHERE id=?`).run(...Object.values(data) as (string | number | null)[], id);
  }
  audit(id: number, kind: string, outcome: string, detail: unknown, now: number) {
    this.db.prepare('INSERT INTO attempts(eventId,at,kind,outcome,detail) VALUES(?,?,?,?,?)').run(id, now, kind, outcome, JSON.stringify(detail));
  }
  setting(key: string): string | undefined { return (this.db.prepare('SELECT value FROM settings WHERE key=?').get(key) as {value: string} | undefined)?.value; }
  set(key: string, value: string) { this.db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value); }
  replaceEmployees(employees: Employee[], now: number) {
    this.transaction(() => {
      this.db.exec('UPDATE employees SET active=0');
      const stmt = this.db.prepare('INSERT INTO employees VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET code=excluded.code,email=excluded.email,name=excluded.name,active=excluded.active');
      for (const e of employees) stmt.run(e.id, e.code, e.email?.toLowerCase().trim() ?? null, e.name, Number(e.active));
      this.set('employeesRefreshedAt', String(now));
      this.set('employeeError', '');
    });
  }
  match(event: EventRow): Employee | null {
    if (event.email) {
      const matches = this.db.prepare('SELECT * FROM employees WHERE lower(email)=? AND active=1').all(event.email.toLowerCase().trim());
      if (matches.length === 1) return matches[0] as unknown as Employee;
    }
    if (!event.name) return null;
    const employees = this.db.prepare('SELECT * FROM employees WHERE active=1').all() as unknown as Employee[];
    const normalizedName = normalizePersonName(event.name);
    const matches = employees.filter(employee => normalizePersonName(employee.name) === normalizedName);
    return matches.length === 1 ? matches[0] as unknown as Employee : null;
  }
  ready(now: number): EventRow[] {
    return this.db.prepare("SELECT * FROM events WHERE nextAttemptAt<=? AND (status='queued' OR (status='held' AND email IS NULL AND userId IS NOT NULL AND reason LIKE 'Employee email is missing%')) ORDER BY occurredAt,id LIMIT 100").all(now) as unknown as EventRow[];
  }
  unresolved(now: number): EventRow[] {
    return this.db.prepare("SELECT * FROM events WHERE status IN ('submitted','uncertain','failed') AND punchId IS NOT NULL AND nextAttemptAt<=? ORDER BY nextAttemptAt,id LIMIT 20").all(now) as unknown as EventRow[];
  }
  beginSend(event: EventRow, punch: Punch, now: number): boolean {
    return this.transaction(() => {
      const r = this.db.prepare("UPDATE events SET status='sending',reason='Submission intent committed',punchId=?,request=?,attempts=attempts+1,updatedAt=? WHERE id=? AND status='queued'").run(punch.id, JSON.stringify(punch), now, event.id);
      if (r.changes) this.audit(event.id, 'submit', 'started', punch, now);
      return Boolean(r.changes);
    });
  }
  recover(now: number) {
    this.db.prepare("UPDATE events SET status='uncertain',reason='Server stopped during submission; reconcile before any resend',nextAttemptAt=?,updatedAt=? WHERE status='sending'").run(now, now);
  }
  list(options: {status?: string; q?: string; offset: number; limit: number}) {
    const where: string[] = [], params: (string | number)[] = [];
    if (options.status) { where.push('status=?'); params.push(options.status); }
    if (options.q) { where.push("(coalesce(name,'') || ' ' || coalesce(email,'') || ' ' || coalesce(employeeName,'') || ' ' || coalesce(door,'') || ' ' || reason) LIKE ?"); params.push(`%${options.q}%`); }
    const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const total = (this.db.prepare(`SELECT count(*) AS n FROM events${clause}`).get(...params) as {n: number}).n;
    const rows = this.db.prepare(`SELECT * FROM events${clause} ORDER BY receivedAt DESC,id DESC LIMIT ? OFFSET ?`).all(...params, options.limit, options.offset);
    return { rows, total };
  }
  counts(): Record<string, number> {
    return Object.fromEntries(this.db.prepare('SELECT status,count(*) AS n FROM events GROUP BY status').all().map(r => [r.status, r.n]));
  }
  attempts(id: number) { return this.db.prepare('SELECT * FROM attempts WHERE eventId=? ORDER BY at,id').all(id); }
  employees(q = '') { return this.db.prepare("SELECT * FROM employees WHERE active=1 AND (coalesce(email,'') LIKE ? OR code LIKE ?) ORDER BY email LIMIT 100").all(`%${q}%`, `%${q}%`); }
  map(eventId: number, employeeId: string) {
    const employee = this.db.prepare('SELECT * FROM employees WHERE id=? AND active=1').get(employeeId) as unknown as Employee | undefined;
    if (!employee?.email) throw new Error('Selected employee has no email');
    this.db.prepare("UPDATE events SET email=?,employeeId=?,employeeCode=?,employeeName=?,reason=?,updatedAt=? WHERE id=? AND status='held'").run(employee.email, employee.id, employee.code, employee.name, 'Email supplied manually; queued for processing', Date.now(), eventId);
  }
  retry(id: number, now: number) { this.db.prepare("UPDATE events SET status='queued',reason='Manually approved for retry',nextAttemptAt=?,updatedAt=? WHERE id=? AND status IN ('held','failed') AND punchId IS NULL").run(now, now, id); }
  session(token: string, expiresAt: number) { this.db.prepare('INSERT INTO sessions(token,expiresAt) VALUES(?,?)').run(token, expiresAt); }
  validSession(token: string, now: number) { this.db.prepare('DELETE FROM sessions WHERE expiresAt<?').run(now); return Boolean(this.db.prepare('SELECT 1 FROM sessions WHERE token=? AND expiresAt>=?').get(token, now)); }
  deleteSession(token: string) { this.db.prepare('DELETE FROM sessions WHERE token=?').run(token); }
  close() { this.db.close(); }
}
