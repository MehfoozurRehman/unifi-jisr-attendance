import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Store } from './store.js';

// HR and admin dashboard accounts. Employee self-service accounts come later.
export type Role = 'admin' | 'hr';
export interface StaffUser { username: string; displayName: string; role: Role; disabled: boolean; createdAt: number; lastLoginAt: number | null }

export function ensureStaff(store: Store) {
  store.db.exec(`CREATE TABLE IF NOT EXISTS staff_users(username TEXT PRIMARY KEY, displayName TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','hr')),
    passwordHash TEXT NOT NULL, disabled INTEGER NOT NULL DEFAULT 0, createdAt INTEGER NOT NULL, lastLoginAt INTEGER);`);
  for (const column of ['username TEXT', 'role TEXT']) { try { store.db.exec(`ALTER TABLE sessions ADD COLUMN ${column}`); } catch { /* already present */ } }
}

const N = 16384;
export const hashPassword = (password: string) => { const salt = randomBytes(16); return `scrypt$${N}$${salt.toString('base64')}$${scryptSync(password, salt, 32, { N }).toString('base64')}`; };
export const verifyPassword = (password: string, stored: string) => {
  const [kind, n, salt, hash] = stored.split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64'), actual = scryptSync(password, Buffer.from(salt, 'base64'), expected.length, { N: Number(n) });
  return timingSafeEqual(expected, actual);
};
export const generatePassword = () => randomBytes(12).toString('base64url');
export const validUsername = (u: string) => /^[a-z0-9._-]{3,40}$/.test(u);

export function listStaff(store: Store): StaffUser[] {
  ensureStaff(store);
  return (store.db.prepare('SELECT username, displayName, role, disabled, createdAt, lastLoginAt FROM staff_users ORDER BY username').all() as any[]).map(r => ({ ...r, disabled: Boolean(r.disabled) }));
}
export function addStaff(store: Store, username: string, displayName: string, role: Role, password: string, now = Date.now()) {
  ensureStaff(store);
  if (!validUsername(username)) throw new Error('Username must be 3-40 characters: lowercase letters, digits, dot, dash or underscore');
  if (password.length < 12) throw new Error('Password must be at least 12 characters');
  store.db.prepare('INSERT INTO staff_users(username, displayName, role, passwordHash, createdAt) VALUES(?,?,?,?,?)').run(username, displayName, role, hashPassword(password), now);
}
export function setStaffPassword(store: Store, username: string, password: string) {
  if (password.length < 12) throw new Error('Password must be at least 12 characters');
  const r = store.db.prepare('UPDATE staff_users SET passwordHash=? WHERE username=?').run(hashPassword(password), username);
  if (!r.changes) throw new Error('No such user');
  store.db.prepare('DELETE FROM sessions WHERE username=?').run(username);
}
export function setStaffDisabled(store: Store, username: string, disabled: boolean) {
  store.db.prepare('UPDATE staff_users SET disabled=? WHERE username=?').run(Number(disabled), username);
  if (disabled) store.db.prepare('DELETE FROM sessions WHERE username=?').run(username);
}

/** Checks credentials. Until the first staff account exists, "admin" + DASHBOARD_PASSWORD is accepted so the system can be set up. */
export function authenticate(store: Store, username: string, password: string, bootstrapPassword: string, now = Date.now()): { username: string; displayName: string; role: Role } | null {
  ensureStaff(store);
  const row = store.db.prepare('SELECT username, displayName, role, passwordHash, disabled FROM staff_users WHERE username=?').get(username) as { username: string; displayName: string; role: Role; passwordHash: string; disabled: number } | undefined;
  if (row) {
    if (row.disabled || !verifyPassword(password, row.passwordHash)) return null;
    store.db.prepare('UPDATE staff_users SET lastLoginAt=? WHERE username=?').run(now, username);
    return { username: row.username, displayName: row.displayName, role: row.role };
  }
  const anyStaff = store.db.prepare('SELECT 1 FROM staff_users LIMIT 1').get();
  if (!anyStaff && username === 'admin' && bootstrapPassword && password.length === bootstrapPassword.length && timingSafeEqual(Buffer.from(password), Buffer.from(bootstrapPassword))) return { username: 'admin', displayName: 'Administrator', role: 'admin' };
  verifyPassword(password, hashPassword('timing-equaliser')); // keep failure timing similar for unknown users
  return null;
}

/** Simple lockout: 5 failed attempts per username or address within 15 minutes. */
const failures = new Map<string, number[]>();
export const loginBlocked = (keys: string[], now = Date.now()) => keys.some(k => (failures.get(k) ?? []).filter(t => now - t < 15 * 60_000).length >= 5);
export const recordFailure = (keys: string[], now = Date.now()) => { for (const k of keys) failures.set(k, [...(failures.get(k) ?? []).filter(t => now - t < 15 * 60_000), now]); };
export const clearFailures = (keys: string[]) => { for (const k of keys) failures.delete(k); };
