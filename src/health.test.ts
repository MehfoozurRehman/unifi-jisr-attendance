import { describe, expect, it } from 'vitest';
import { config } from './config.js';
import { Store } from './store.js';
import { ensureDirectory, saveDirectory } from './directory.js';
import { health } from './health.js';
import type { JisrGateway, UnifiDirectory } from './domain.js';

const ok = { ok: true, status: 200, message: 'ok' };
const gateway = (employees = ok): JisrGateway => ({
  employees: async () => [], prepare: async () => {}, submit: async () => ({ outcome: 'accepted', message: '' }), confirm: async () => ({ outcome: 'pending', message: '' }),
  probe: async () => ({ auth: ok, employees, attendance: ok }),
});
const unifi = (withoutEmail: string[] = []): UnifiDirectory => ({ emailForUser: async () => null, probe: async () => ({ ...ok, users: 10, withoutEmail }) });

describe('system health', () => {
  it('reports missing Jisr permissions, users without email and a stalled worker', async () => {
    const s = new Store(':memory:'); ensureDirectory(s);
    const now = Date.now();
    s.set('workerLastTick', String(now - 10 * 60_000));
    const report = await health(s, config, gateway({ ok: false, status: 403, message: 'notAuthorized' }), unifi(['Guest Badge']), { refresh: true, now });
    const by = Object.fromEntries(report.checks.map(c => [c.id, c]));
    expect(report.level).toBe('fail');
    expect(by['jisr.auth'].level).toBe('ok');
    expect(by['jisr.employees']).toMatchObject({ level: 'fail', code: 'notAuthorized' });
    expect(by['unifi.emails']).toMatchObject({ level: 'warn', code: 'missingEmails', params: { count: 1, names: ['Guest Badge'] } });
    expect(by['system.worker']).toMatchObject({ level: 'fail', code: 'stalled' });
    expect(by['data.directory'].code).toBe('notImported');
    s.close();
  });
  it('is healthy when every check passes, and flags people tapping in who are not on the list', async () => {
    const s = new Store(':memory:'); ensureDirectory(s);
    const now = Date.now();
    s.set('workerLastTick', String(now)); s.set('employeesRefreshedAt', String(now));
    saveDirectory(s, [{ employeeId: 'A', jisrId: null, nameAr: null, nameEn: 'Listed', titleAr: null, titleEn: null, function: null, department: 'Ops', email: 'listed@example.com', officeNumber: null, officeType: null, active: true }], [], now);
    const tap = (email: string, name: string) => JSON.stringify({ id: 'access.unlocks.location_unlocked', device: 'r', device_name: 'Door', location_name: 'Door', user: email, user_name: name, user_email: email, time: String(Math.floor(now / 1000)), direction: 'entered', credential_type: 'NFC', admin: '', emergency_mode: '' });
    s.ingest(tap('listed@example.com', 'Listed'), now, config);
    const clean = await health(s, config, gateway(), unifi(), { refresh: true, now });
    expect(clean.checks.find(c => c.id === 'data.unmatched')?.level).toBe('ok');
    expect(clean.checks.filter(c => c.group !== 'data' && c.id !== 'system.queue').every(c => c.level === 'ok')).toBe(true);
    s.ingest(tap('visitor@example.com', 'Visitor'), now, config);
    const after = await health(s, config, gateway(), unifi(), { refresh: true, now });
    expect(after.checks.find(c => c.id === 'data.unmatched')).toMatchObject({ level: 'warn', params: { count: 1, names: ['Visitor'] } });
    s.close();
  });
  it('counts a tap by someone removed from the list as unmatched, and ignores old taps', async () => {
    const s = new Store(':memory:'); ensureDirectory(s);
    const now = Date.now(), person = { employeeId: 'A', jisrId: null, nameAr: null, nameEn: 'Left', titleAr: null, titleEn: null, function: null, department: 'Ops', email: 'left@example.com', officeNumber: null, officeType: null, active: true };
    const other = { ...person, employeeId: 'B', nameEn: 'Stays', email: 'stays@example.com' };
    saveDirectory(s, [person, other], [], now);
    saveDirectory(s, [other], [], now);
    const tap = (email: string, name: string, at: number) => JSON.stringify({ id: 'access.unlocks.location_unlocked', device: 'r', device_name: 'Door', location_name: 'Door', user: email, user_name: name, user_email: email, time: String(Math.floor(at / 1000)), direction: 'entered', credential_type: 'NFC', admin: '', emergency_mode: '' });
    s.ingest(tap('left@example.com', 'Left', now), now, config);
    const old = now - 100 * 86_400_000;
    s.ingest(tap('gone@example.com', 'Gone', old), old, { ...config, MAX_EVENT_AGE_MS: 1e12 });
    const report = await health(s, config, gateway(), unifi(), { refresh: true, now });
    expect(report.checks.find(c => c.id === 'data.unmatched')).toMatchObject({ level: 'warn', params: { count: 1, names: ['Left'] } });
    s.close();
  });
  it('still returns a report when the database cannot be read', async () => {
    const s = new Store(':memory:'); ensureDirectory(s); s.close();
    const report = await health(s, config, gateway(), unifi(), { refresh: true, now: Date.now() });
    expect(report.level).toBe('fail');
    expect(report.checks.find(c => c.id === 'system.database')).toMatchObject({ level: 'fail', code: 'unreachable' });
    expect(report.checks.find(c => c.id === 'jisr.auth')?.level).toBe('ok');
  });
});
