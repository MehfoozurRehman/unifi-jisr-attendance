import { describe, expect, it } from 'vitest';
import { config } from './config.js';
import { Attendance, summarizeDay, type Tap } from './attendance.js';
import { Store } from './store.js';

const at = (date: string, time: string) => Date.parse(`${date}T${time}:00+03:00`);
const tap = (date: string, time: string, direction: 'in' | 'out'): Tap => ({ at: at(date, time), direction });
const rules = { ...config, WORK_START_MINUTES: 9 * 60, LATE_GRACE_MINUTES: 15, REQUIRED_MINUTES: 8 * 60, WEEKEND_DAYS: [5, 6] };
const later = at('2026-10-31', '12:00'); // a Saturday after the test days

describe('attendance day rules', () => {
  it('is green when on time with full hours', () => {
    const day = summarizeDay('2026-10-28', [tap('2026-10-28', '08:55', 'in'), tap('2026-10-28', '17:05', 'out')], rules, later);
    expect(day.status).toBe('green'); expect(day.minutes).toBe(490); expect(day.late).toBe(false);
  });
  it('is yellow when late or short', () => {
    expect(summarizeDay('2026-10-28', [tap('2026-10-28', '09:40', 'in'), tap('2026-10-28', '18:00', 'out')], rules, later).status).toBe('yellow');
    expect(summarizeDay('2026-10-28', [tap('2026-10-28', '09:00', 'in'), tap('2026-10-28', '13:00', 'out')], rules, later).status).toBe('yellow');
  });
  it('is red when absent on a workday or the exit tap is missing', () => {
    expect(summarizeDay('2026-10-28', [], rules, later).status).toBe('red');
    const noExit = summarizeDay('2026-10-28', [tap('2026-10-28', '08:50', 'in')], rules, later);
    expect(noExit.status).toBe('red'); expect(noExit.missingOut).toBe(true);
  });
  it('treats the weekend as off and counts only in-to-out time', () => {
    expect(summarizeDay('2026-10-30', [], rules, later).status).toBe('off');
    const day = summarizeDay('2026-10-28', [tap('2026-10-28', '09:00', 'in'), tap('2026-10-28', '12:00', 'out'), tap('2026-10-28', '13:00', 'in'), tap('2026-10-28', '18:00', 'out')], rules, later);
    expect(day.minutes).toBe(480); expect(day.firstIn).toBe(at('2026-10-28', '09:00')); expect(day.lastOut).toBe(at('2026-10-28', '18:00'));
  });
  it('flags an exit with no entry and does not guess lateness from the later entry', () => {
    const now = at('2026-10-28', '14:00');
    const day = summarizeDay('2026-10-28', [tap('2026-10-28', '11:59', 'out'), tap('2026-10-28', '13:28', 'in')], rules, now);
    expect(day.missingIn).toBe(true); expect(day.late).toBe(false); expect(day.lastOut).toBeNull(); expect(day.inside).toBe(true); expect(day.status).toBe('yellow');
  });
  it('does not mark days before recording started as absent', () => {
    expect(summarizeDay('2026-10-20', [], rules, later, '2026-10-28').status).toBe('untracked');
    expect(summarizeDay('2026-10-29', [], rules, later, '2026-10-28').status).toBe('red');
  });
  it('shows a person still inside today without marking the day red', () => {
    const now = at('2026-10-28', '11:00');
    const day = summarizeDay('2026-10-28', [tap('2026-10-28', '09:00', 'in')], rules, now);
    expect(day.inside).toBe(true); expect(day.minutes).toBe(120); expect(day.status).toBe('today');
  });
  it('builds a month for one person from stored events, ignoring remote unlocks', () => {
    const s = new Store(':memory:');
    const raw = (time: string, direction: string, credential = 'FACE') => JSON.stringify({ id: 'access.unlocks.location_unlocked', device: 'r1', device_name: 'Door', location_name: 'Door', user: 'u1', user_name: 'Exact Person', user_email: 'exact@example.com', time: String(at('2026-10-28', time) / 1000), direction, credential_type: credential, admin: '', emergency_mode: '' });
    const received = at('2026-10-28', '18:30');
    s.ingest(raw('08:55', 'entered'), received, config); s.ingest(raw('12:00', 'exited', 'MOBILE_BUTTON'), received, config); s.ingest(raw('17:05', 'exited'), received, config);
    const month = new Attendance(s, rules).month('exact@example.com', 2026, 10, later);
    const day = month.find(d => d.date === '2026-10-28')!;
    expect(month).toHaveLength(31); expect(day.taps).toHaveLength(2); expect(day.status).toBe('green');
    expect(new Attendance(s, rules).people().map(p => p.email)).toEqual(['exact@example.com']);
    s.close();
  });
});
