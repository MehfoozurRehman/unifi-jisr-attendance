import type { Config } from './config.js';
import type { Store } from './store.js';
import { Attendance, dateParts, dayStart, localDate, summarizeDay, type DaySummary, type Tap } from './attendance.js';
import { directory } from './directory.js';

const DAY = 86_400_000;
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const datesBetween = (from: string, to: string) => { const out: string[] = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; };
const minuteOfDay = (instant: number, config: Config) => dateParts(instant, config.TIMEZONE).minutes;
const median = (values: number[]) => { if (!values.length) return null; const s = [...values].sort((a, b) => a - b); const mid = Math.floor(s.length / 2); return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2); };
const avg = (total: number, n: number) => n ? Math.round(total / n) : 0;

/** A person on the dashboard: an employee from the HR list (linked to UniFi by email), or a UniFi badge holder when no list is loaded. */
export interface Member {
  key: string; employeeId: string | null; name: string; nameAr: string | null; email: string | null; titleEn: string | null; titleAr: string | null;
  function: string | null; department: string | null; officeNumber: string | null; inDirectory: boolean;
}
export interface Scope { person?: string; department?: string; fn?: string }

export function members(store: Store, attendance: Attendance): Member[] {
  const list = directory(store);
  if (!list.length) return attendance.people().map(p => ({ key: p.key, employeeId: null, name: p.name ?? p.email ?? p.key, nameAr: null, email: p.email, titleEn: null, titleAr: null, function: null, department: p.department, officeNumber: null, inDirectory: false }));
  return list.map(e => ({ key: e.email ? e.email.toLowerCase() : `id:${e.employeeId}`, employeeId: e.employeeId, name: e.nameEn, nameAr: e.nameAr, email: e.email, titleEn: e.titleEn, titleAr: e.titleAr, function: e.function, department: e.department, officeNumber: e.officeNumber, inDirectory: true }));
}

export interface PersonStats {
  member: Member; expected: number; present: number; green: number; yellow: number; red: number; late: number;
  minutes: number; averageMinutes: number; outsideMinutes: number; averageOutside: number; breaks: number; averageBreaks: number;
  lateMinutes: number; overtimeMinutes: number; medianArrival: number | null; medianDeparture: number | null;
  attendanceRate: number | null; onTimeRate: number | null; streak: number; bestStreak: number;
  today: { inside: boolean; firstIn: number | null; lastOut: number | null; minutes: number; status: string };
  days?: DaySummary[];
}
export interface DailyPoint { date: string; workday: boolean; tracked: boolean; present: number; onTime: number; late: number; absent: number; minutes: number; averageMinutes: number; outsideMinutes: number; breaks: number }

const ARRIVAL_FROM = 6 * 60, ARRIVAL_TO = 13 * 60, DEPART_FROM = 12 * 60, DEPART_TO = 23 * 60, BUCKET = 30;
const histogram = (values: number[], from: number, to: number) => {
  const bins = Array.from({ length: (to - from) / BUCKET }, (_, i) => ({ start: from + i * BUCKET, count: 0 }));
  for (const v of values) { const i = Math.floor((Math.min(Math.max(v, from), to - 1) - from) / BUCKET); bins[i].count++; }
  return bins;
};

/** Range analytics for the company, one department or function, or one person. Dates are Riyadh calendar days, inclusive. */
export function analyze(store: Store, attendance: Attendance, config: Config, from: string, to: string, scope: Scope = {}, now = Date.now()) {
  const today = localDate(now, config.TIMEZONE), since = attendance.since();
  const dates = datesBetween(from, to);
  const everyone = members(store, attendance);
  const scoped = everyone.filter(m => (!scope.person || m.key === scope.person || m.employeeId === scope.person) && (!scope.department || m.department === scope.department) && (!scope.fn || m.function === scope.fn));
  const memberKeys = new Set(scoped.map(m => m.key));

  // UniFi taps are keyed by email (or "u:<user id>" before the email was known); fold both onto the member key.
  const badgeHolders = attendance.people();
  const emailByUser = new Map(badgeHolders.filter(p => p.email && p.userId).map(p => [p.userId!, p.email!]));
  const taps = attendance.taps(scope.person && scoped[0] ? scoped[0].key : null, dayStart(from, config), dayStart(to, config) + DAY);
  const byPerson = new Map<string, Map<string, Tap[]>>(), doors = new Map<string, number>(), unknown = new Map<string, { name: string | null; taps: number }>();
  for (const tap of taps) {
    const k = tap.key.startsWith('u:') && tap.userId && emailByUser.has(tap.userId) ? emailByUser.get(tap.userId)! : tap.key;
    if (!memberKeys.has(k)) { if (!scope.person && !scope.department && !scope.fn) { const u = unknown.get(k) ?? { name: badgeHolders.find(p => p.key === k)?.name ?? null, taps: 0 }; u.taps++; unknown.set(k, u); } continue; }
    const date = localDate(tap.at, config.TIMEZONE), days = byPerson.get(k) ?? new Map<string, Tap[]>();
    days.set(date, [...(days.get(date) ?? []), { at: tap.at, direction: tap.direction }]); byPerson.set(k, days);
    if (tap.door) doors.set(tap.door, (doors.get(tap.door) ?? 0) + 1);
  }

  const daily = new Map<string, DailyPoint>(dates.map(date => [date, { date, workday: !config.WEEKEND_DAYS.includes(new Date(`${date}T12:00:00Z`).getUTCDay()), tracked: !!since && date >= since && date <= today, present: 0, onTime: 0, late: 0, absent: 0, minutes: 0, averageMinutes: 0, outsideMinutes: 0, breaks: 0 }]));
  const occupancy = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  const weekdayCount = Array.from({ length: 7 }, () => 0);
  for (const date of dates) if (daily.get(date)!.tracked) weekdayCount[new Date(`${date}T12:00:00Z`).getUTCDay()]++;
  const arrivals: number[] = [], departures: number[] = [];

  const stats: PersonStats[] = scoped.map(member => {
    const dayMap = byPerson.get(member.key) ?? new Map<string, Tap[]>();
    const summaries: DaySummary[] = dates.map(date => summarizeDay(date, dayMap.get(date) ?? [], config, now, since));
    const personArrivals: number[] = [], personDepartures: number[] = [];
    let streak = 0, bestStreak = 0, run = 0;
    for (const day of summaries) {
      const point = daily.get(day.date)!;
      if (day.taps.length) {
        point.present++; point.minutes += day.minutes; point.outsideMinutes += day.outsideMinutes; point.breaks += day.breaks;
        if (day.status === 'green' || (day.status === 'today' && !day.late)) point.onTime++;
        if (day.status === 'yellow') point.late++;
        if (day.firstIn !== null && !day.missingIn && day.date !== since) { const m = minuteOfDay(day.firstIn, config); arrivals.push(m); personArrivals.push(m); }
        if (day.lastOut !== null && day.date !== today) { const m = minuteOfDay(day.lastOut, config); departures.push(m); personDepartures.push(m); }
        const seen = new Set<number>(); let open: number | null = null;
        for (const tap of day.taps) {
          if (tap.direction === 'in') { if (open === null) open = tap.at; continue; }
          if (open !== null) { for (let h = Math.floor(minuteOfDay(open, config) / 60); h <= Math.floor(minuteOfDay(tap.at, config) / 60); h++) seen.add(h); open = null; }
        }
        if (open !== null && day.inside) for (let h = Math.floor(minuteOfDay(open, config) / 60); h <= Math.floor(minuteOfDay(now, config) / 60); h++) seen.add(h);
        for (const h of seen) occupancy[day.weekday][h]++;
      } else if (day.status === 'red') point.absent++;
      // On-time streak over tracked workdays: green extends it, yellow or red ends it; today only counts once it is settled.
      if (day.workday && day.status !== 'untracked' && day.status !== 'future' && day.status !== 'today') { run = day.status === 'green' ? run + 1 : 0; bestStreak = Math.max(bestStreak, run); }
    }
    streak = run;
    const worked = summaries.filter(d => d.taps.length), sum = (f: (d: DaySummary) => number) => worked.reduce((s, d) => s + f(d), 0);
    const expected = summaries.filter(d => d.workday && d.status !== 'untracked' && d.status !== 'future' && !(d.status === 'today' && !d.taps.length)).length;
    const presentWorkdays = summaries.filter(d => d.workday && d.taps.length).length;
    const green = summaries.filter(d => d.status === 'green').length, minutes = sum(d => d.minutes);
    const t = summaries.find(d => d.date === today);
    return {
      member, expected, present: worked.length, green, yellow: summaries.filter(d => d.status === 'yellow').length, red: summaries.filter(d => d.status === 'red').length,
      late: summaries.filter(d => d.late).length, minutes, averageMinutes: avg(minutes, worked.length),
      outsideMinutes: sum(d => d.outsideMinutes), averageOutside: avg(sum(d => d.outsideMinutes), worked.length), breaks: sum(d => d.breaks), averageBreaks: worked.length ? Math.round((sum(d => d.breaks) / worked.length) * 10) / 10 : 0,
      lateMinutes: sum(d => d.lateMinutes), overtimeMinutes: sum(d => d.overtimeMinutes), medianArrival: median(personArrivals), medianDeparture: median(personDepartures),
      attendanceRate: expected ? presentWorkdays / expected : null, onTimeRate: worked.length ? green / worked.length : null, streak, bestStreak,
      today: { inside: !!t?.inside, firstIn: t?.firstIn ?? null, lastOut: t?.lastOut ?? null, minutes: t?.minutes ?? 0, status: t?.status ?? 'off' },
      ...(scope.person ? { days: summaries } : {}),
    };
  });

  for (const point of daily.values()) point.averageMinutes = avg(point.minutes, point.present);
  const series = [...daily.values()];
  const totalPresent = series.reduce((s, p) => s + p.present, 0), totalMinutes = series.reduce((s, p) => s + p.minutes, 0);
  const expected = stats.reduce((s, p) => s + p.expected, 0), presentWork = stats.reduce((s, p) => s + Math.round((p.attendanceRate ?? 0) * p.expected), 0);

  // Department and function roll-ups (only meaningful above the person level).
  const groupBy = (field: 'department' | 'function') => {
    const groups = new Map<string, PersonStats[]>();
    for (const s of stats) { const k = s.member[field] || '—'; groups.set(k, [...(groups.get(k) ?? []), s]); }
    return [...groups.entries()].map(([name, list]) => {
      const present = list.reduce((s, p) => s + p.present, 0), exp = list.reduce((s, p) => s + p.expected, 0);
      return {
        name, function: field === 'department' ? list[0].member.function : name, people: list.length, insideNow: list.filter(p => p.today.inside).length,
        attendanceRate: exp ? list.reduce((s, p) => s + Math.round((p.attendanceRate ?? 0) * p.expected), 0) / exp : null,
        onTimeRate: present ? list.reduce((s, p) => s + p.green, 0) / present : null, averageMinutes: avg(list.reduce((s, p) => s + p.minutes, 0), present),
        averageOutside: avg(list.reduce((s, p) => s + p.outsideMinutes, 0), present), lateDays: list.reduce((s, p) => s + p.yellow, 0), absentDays: list.reduce((s, p) => s + p.red, 0),
        medianArrival: median(list.map(p => p.medianArrival).filter((v): v is number => v !== null)),
      };
    }).sort((a, b) => b.people - a.people);
  };

  return {
    range: { from, to, today, since: since ?? null }, scope,
    kpis: {
      people: stats.length, insideNow: stats.filter(s => s.today.inside).length, leftToday: stats.filter(s => !s.today.inside && s.today.firstIn !== null).length,
      attendanceRate: expected ? presentWork / expected : null,
      onTimeRate: totalPresent ? series.reduce((s, p) => s + p.onTime, 0) / totalPresent : null,
      averageMinutes: avg(totalMinutes, totalPresent), totalMinutes,
      averageOutside: avg(series.reduce((s, p) => s + p.outsideMinutes, 0), totalPresent), averageBreaks: totalPresent ? Math.round((series.reduce((s, p) => s + p.breaks, 0) / totalPresent) * 10) / 10 : 0,
      lateDays: series.reduce((s, p) => s + p.late, 0), absentDays: series.reduce((s, p) => s + p.absent, 0),
      overtimeMinutes: stats.reduce((s, p) => s + p.overtimeMinutes, 0), medianArrival: median(arrivals), medianDeparture: median(departures),
    },
    daily: series,
    arrivals: histogram(arrivals, ARRIVAL_FROM, ARRIVAL_TO), departures: histogram(departures, DEPART_FROM, DEPART_TO),
    weekHours: occupancy.map((hours, weekday) => hours.map(total => weekdayCount[weekday] ? Math.round((total / weekdayCount[weekday]) * 10) / 10 : 0)),
    doors: [...doors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([door, count]) => ({ door, count })),
    people: stats.sort((a, b) => b.minutes - a.minutes),
    departments: scope.person ? [] : groupBy('department'), functions: scope.person || scope.department ? [] : groupBy('function'),
    unmatched: [...unknown.entries()].map(([key, u]) => ({ key, name: u.name, taps: u.taps })).sort((a, b) => b.taps - a.taps),
  };
}

/** GitHub-style contribution grid: the 53 weeks ending on `to`, one cell per day. */
export function contributions(store: Store, attendance: Attendance, config: Config, to: string, scope: Scope = {}, now = Date.now()) {
  const end = new Date(`${to}T12:00:00Z`); const endOfWeek = addDays(to, 6 - end.getUTCDay());
  const from = addDays(endOfWeek, -(53 * 7) + 1);
  const result = analyze(store, attendance, config, from, endOfWeek, scope, now);
  return { from, to: endOfWeek, days: result.daily.map(p => ({ date: p.date, minutes: p.minutes, present: p.present, tracked: p.tracked, workday: p.workday })), people: result.kpis.people };
}
