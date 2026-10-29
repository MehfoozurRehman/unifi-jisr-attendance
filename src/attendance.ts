import type { Config } from './config.js';
import type { Store } from './store.js';

export type DayStatus = 'green' | 'yellow' | 'red' | 'off' | 'future' | 'today' | 'untracked';
export interface Tap { at: number; direction: 'in' | 'out' }
export interface DaySummary {
  date: string; weekday: number; workday: boolean; status: DayStatus;
  firstIn: number | null; lastOut: number | null; minutes: number;
  late: boolean; short: boolean; missingOut: boolean; missingIn: boolean; inside: boolean; taps: Tap[];
}
export interface Person { key: string; name: string | null; email: string | null; userId: string | null; employeeCode: string | null; department: string | null; managerEmail: string | null }

const dateParts = (instant: number, timezone: string) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' }).formatToParts(instant).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
};
export const localDate = (instant: number, timezone: string) => dateParts(instant, timezone).date;
const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
// Riyadh has no daylight saving, so a fixed offset is exact for day boundaries.
const dayStart = (date: string, config: Config) => Date.parse(`${date}T00:00:00${config.TIMEZONE_OFFSET}`);

// Taps that prove physical presence: dated, with a direction, and not rejected as remote/admin/emergency.
// Repeated same-direction taps are skipped for Jisr but still prove presence, so they count here.
const TAP_FILTER = "direction IN ('in','out') AND occurredAt IS NOT NULL AND (status <> 'skipped' OR reason LIKE 'Repeated%')";

// `since` is the first day the system recorded any tap; earlier days have no evidence either way.
export function summarizeDay(date: string, taps: Tap[], config: Config, now: number, since?: string): DaySummary {
  const weekday = weekdayOf(date), workday = !config.WEEKEND_DAYS.includes(weekday);
  const today = localDate(now, config.TIMEZONE);
  const sorted = [...taps].sort((a, b) => a.at - b.at);
  let open: number | null = null, minutes = 0, firstIn: number | null = null, lastOut: number | null = null, missingIn = false;
  for (const tap of sorted) {
    if (tap.direction === 'in') { if (open === null) open = tap.at; firstIn ??= tap.at; }
    else if (open !== null) { minutes += Math.round((tap.at - open) / 60_000); open = null; lastOut = tap.at; }
    else { missingIn = true; lastOut = tap.at; } // an exit with no entry: the time before it cannot be counted
  }
  const isToday = date === today, inside = isToday && open !== null;
  if (inside) { minutes += Math.round((now - open!) / 60_000); lastOut = null; }
  const missingOut = !isToday && open !== null;
  // If the day opens with an exit, the person arrived before any recorded entry, so lateness is unknown.
  const opensWithExit = sorted[0]?.direction === 'out';
  const late = !opensWithExit && firstIn !== null && dateParts(firstIn, config.TIMEZONE).minutes > config.WORK_START_MINUTES + config.LATE_GRACE_MINUTES;
  const short = !isToday && sorted.length > 0 && minutes < config.REQUIRED_MINUTES;
  let status: DayStatus;
  if (date > today) status = 'future';
  else if (!sorted.length && since && date < since) status = 'untracked';
  else if (!sorted.length) status = isToday ? 'today' : workday ? 'red' : 'off';
  else if (missingOut) status = 'red';
  else if (!workday) status = 'green';
  else if (late || short || missingIn) status = 'yellow';
  else status = isToday && inside ? 'today' : 'green';
  return { date, weekday, workday, status, firstIn, lastOut, minutes, late, short, missingOut, missingIn, inside, taps: sorted };
}

export class Attendance {
  constructor(private store: Store, private config: Config) {}
  private keyClause(key: string) {
    // A person is their email; events from before the email was known are linked through the UniFi user id.
    if (key.startsWith('u:')) return { sql: 'userId=?', params: [key.slice(2)] };
    return { sql: "(lower(email)=? OR userId IN (SELECT userId FROM events WHERE lower(email)=? AND userId IS NOT NULL))", params: [key, key] };
  }
  since(): string | undefined {
    const row = this.store.db.prepare(`SELECT min(occurredAt) AS first FROM events WHERE ${TAP_FILTER}`).get() as { first: number | null } | undefined;
    return row?.first ? localDate(row.first, this.config.TIMEZONE) : undefined;
  }
  people(q = ''): Person[] {
    const rows = this.store.db.prepare(`SELECT coalesce(lower(e.email), 'u:' || e.userId) AS key, max(e.name) AS name, max(lower(e.email)) AS email, max(e.userId) AS userId,
      max(e.employeeCode) AS employeeCode, max(m.department) AS department, max(m.managerEmail) AS managerEmail
      FROM events e LEFT JOIN employees m ON lower(m.email)=lower(e.email)
      WHERE ${TAP_FILTER} AND (e.email IS NOT NULL OR e.userId IS NOT NULL) GROUP BY key ORDER BY name`).all() as unknown as Person[];
    // Drop id-only rows when the same user id already appears under an email.
    const byEmail = new Set(rows.filter(r => r.email).map(r => r.userId));
    const needle = q.trim().toLowerCase();
    return rows.filter(r => r.email || !byEmail.has(r.userId)).filter(r => !needle || `${r.name} ${r.email} ${r.department}`.toLowerCase().includes(needle));
  }
  private taps(key: string | null, from: number, to: number) {
    const clause = key ? this.keyClause(key) : { sql: '1=1', params: [] as string[] };
    return this.store.db.prepare(`SELECT coalesce(lower(email), 'u:' || userId) AS key, userId, occurredAt AS at, direction FROM events
      WHERE ${TAP_FILTER} AND ${clause.sql} AND occurredAt>=? AND occurredAt<? ORDER BY occurredAt`).all(...clause.params, from, to) as unknown as (Tap & { key: string; userId: string | null })[];
  }
  month(key: string, year: number, month: number, now = Date.now()): DaySummary[] {
    const first = `${year}-${String(month).padStart(2, '0')}-01`, days = daysIn(year, month);
    const taps = this.taps(key, dayStart(first, this.config), dayStart(first, this.config) + days * 86_400_000);
    const byDay = new Map<string, Tap[]>();
    for (const tap of taps) { const date = localDate(tap.at, this.config.TIMEZONE); byDay.set(date, [...(byDay.get(date) ?? []), { at: tap.at, direction: tap.direction }]); }
    return Array.from({ length: days }, (_, i) => { const date = `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`; return summarizeDay(date, byDay.get(date) ?? [], this.config, now, this.since()); });
  }
  year(key: string, year: number, now = Date.now()) {
    return Array.from({ length: 12 }, (_, i) => { const days = this.month(key, year, i + 1, now); return { month: i + 1, days, totals: totals(days) }; });
  }
  team(year: number, month: number, now = Date.now()) {
    const people = this.people();
    const first = `${year}-${String(month).padStart(2, '0')}-01`, days = daysIn(year, month);
    const taps = this.taps(null, dayStart(first, this.config), dayStart(first, this.config) + days * 86_400_000);
    // Map id-only taps onto the email key of the same UniFi user.
    const emailByUser = new Map(people.filter(p => p.email && p.userId).map(p => [p.userId!, p.email!]));
    const byPerson = new Map<string, Map<string, Tap[]>>();
    for (const tap of taps) {
      const key = tap.key.startsWith('u:') && tap.userId && emailByUser.has(tap.userId) ? emailByUser.get(tap.userId)! : tap.key;
      const date = localDate(tap.at, this.config.TIMEZONE), person = byPerson.get(key) ?? new Map();
      person.set(date, [...(person.get(date) ?? []), { at: tap.at, direction: tap.direction }]); byPerson.set(key, person);
    }
    const today = localDate(now, this.config.TIMEZONE);
    return people.map(person => {
      const dayMap = byPerson.get(person.key) ?? new Map<string, Tap[]>();
      const summaries = Array.from({ length: days }, (_, i) => { const date = `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`; return summarizeDay(date, dayMap.get(date) ?? [], this.config, now, this.since()); });
      const todaySummary = summaries.find(d => d.date === today) ?? summarizeDay(today, this.taps(person.key, dayStart(today, this.config), dayStart(today, this.config) + 86_400_000), this.config, now);
      return { person, today: todaySummary, totals: totals(summaries), days: summaries.map(d => d.status) };
    });
  }
}

export function totals(days: DaySummary[]) {
  const worked = days.filter(d => d.taps.length);
  const minutes = worked.reduce((sum, d) => sum + d.minutes, 0);
  return {
    green: days.filter(d => d.status === 'green').length, yellow: days.filter(d => d.status === 'yellow').length, red: days.filter(d => d.status === 'red').length,
    late: days.filter(d => d.late).length, present: worked.length, minutes, averageMinutes: worked.length ? Math.round(minutes / worked.length) : 0,
  };
}
