import type { Config } from './config.js';
import { Attendance, dateParts, dayStart, localDate, summarizeDay, type DaySummary, type Person, type Tap } from './attendance.js';

const DAY = 86_400_000;
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const datesBetween = (from: string, to: string) => { const out: string[] = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; };
const minuteOfDay = (instant: number, config: Config) => dateParts(instant, config.TIMEZONE).minutes;
const median = (values: number[]) => { if (!values.length) return null; const s = [...values].sort((a, b) => a - b); const mid = Math.floor(s.length / 2); return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2); };

export interface PersonStats { person: Person; present: number; green: number; yellow: number; red: number; late: number; minutes: number; averageMinutes: number; medianArrival: number | null; insideNow: boolean }
export interface DailyPoint { date: string; workday: boolean; tracked: boolean; present: number; onTime: number; late: number; absent: number; minutes: number; averageMinutes: number }

const ARRIVAL_FROM = 6 * 60, ARRIVAL_TO = 13 * 60, DEPART_FROM = 12 * 60, DEPART_TO = 23 * 60, BUCKET = 30;
const histogram = (values: number[], from: number, to: number) => {
  const bins = Array.from({ length: (to - from) / BUCKET }, (_, i) => ({ start: from + i * BUCKET, count: 0 }));
  for (const v of values) { const i = Math.floor((Math.min(Math.max(v, from), to - 1) - from) / BUCKET); bins[i].count++; }
  return bins;
};

/** Range analytics for the whole team (key = null) or one person. Dates are Riyadh calendar days, inclusive. */
export function analyze(attendance: Attendance, config: Config, from: string, to: string, key: string | null, now = Date.now()) {
  const today = localDate(now, config.TIMEZONE), since = attendance.since();
  const last = to > today ? today : to;
  const dates = datesBetween(from, to);
  const people = key ? attendance.people().filter(p => p.key === key) : attendance.people();
  const emailByUser = new Map(people.filter(p => p.email && p.userId).map(p => [p.userId!, p.email!]));
  const taps = attendance.taps(key, dayStart(from, config), dayStart(to, config) + DAY);
  const byPerson = new Map<string, Map<string, Tap[]>>();
  const doors = new Map<string, number>();
  for (const tap of taps) {
    const k = key ?? (tap.key.startsWith('u:') && tap.userId && emailByUser.has(tap.userId) ? emailByUser.get(tap.userId)! : tap.key);
    const date = localDate(tap.at, config.TIMEZONE), days = byPerson.get(k) ?? new Map<string, Tap[]>();
    days.set(date, [...(days.get(date) ?? []), { at: tap.at, direction: tap.direction }]); byPerson.set(k, days);
    if (tap.door) doors.set(tap.door, (doors.get(tap.door) ?? 0) + 1);
  }

  const daily = new Map<string, DailyPoint>(dates.map(date => [date, { date, workday: !config.WEEKEND_DAYS.includes(new Date(`${date}T12:00:00Z`).getUTCDay()), tracked: !!since && date >= since && date <= today, present: 0, onTime: 0, late: 0, absent: 0, minutes: 0, averageMinutes: 0 }]));
  // weekday x hour: how many distinct people were inside during that hour, summed over the range.
  const occupancy = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  const weekdayCount = Array.from({ length: 7 }, () => 0);
  for (const date of dates) if (daily.get(date)!.tracked) weekdayCount[new Date(`${date}T12:00:00Z`).getUTCDay()]++;
  const arrivals: number[] = [], departures: number[] = [];

  const stats: PersonStats[] = people.map(person => {
    const dayMap = byPerson.get(person.key) ?? new Map<string, Tap[]>();
    const summaries: DaySummary[] = dates.map(date => summarizeDay(date, dayMap.get(date) ?? [], config, now, since));
    const personArrivals: number[] = [];
    for (const day of summaries) {
      const point = daily.get(day.date)!;
      if (day.taps.length) {
        point.present++; point.minutes += day.minutes;
        if (day.status === 'green' || (day.status === 'today' && !day.late)) point.onTime++;
        if (day.status === 'yellow') point.late++;
        if (day.firstIn !== null && !day.missingIn) { const m = minuteOfDay(day.firstIn, config); arrivals.push(m); personArrivals.push(m); }
        if (day.lastOut !== null) departures.push(minuteOfDay(day.lastOut, config));
        // Mark every hour this person was inside, from paired in/out intervals (open interval runs to now for today).
        const weekday = day.weekday, seen = new Set<number>();
        let open: number | null = null;
        for (const tap of day.taps) {
          if (tap.direction === 'in') { if (open === null) open = tap.at; continue; }
          if (open !== null) { for (let h = Math.floor(minuteOfDay(open, config) / 60); h <= Math.floor(minuteOfDay(tap.at, config) / 60); h++) seen.add(h); open = null; }
        }
        if (open !== null && day.inside) for (let h = Math.floor(minuteOfDay(open, config) / 60); h <= Math.floor(minuteOfDay(now, config) / 60); h++) seen.add(h);
        for (const h of seen) occupancy[weekday][h]++;
      } else if (day.status === 'red') point.absent++;
    }
    const worked = summaries.filter(d => d.taps.length), minutes = worked.reduce((s, d) => s + d.minutes, 0);
    const todaySummary = summaries.find(d => d.date === today);
    return {
      person, present: worked.length, green: summaries.filter(d => d.status === 'green').length, yellow: summaries.filter(d => d.status === 'yellow').length,
      red: summaries.filter(d => d.status === 'red').length, late: summaries.filter(d => d.late).length, minutes,
      averageMinutes: worked.length ? Math.round(minutes / worked.length) : 0, medianArrival: median(personArrivals), insideNow: !!todaySummary?.inside,
      ...(key ? { days: summaries } : {}),
    };
  });

  for (const point of daily.values()) point.averageMinutes = point.present ? Math.round(point.minutes / point.present) : 0;
  const series = [...daily.values()];
  const trackedWorkdays = series.filter(p => p.tracked && p.workday && p.date <= last);
  const expected = trackedWorkdays.length * Math.max(people.length, 1);
  const presentOnWorkdays = trackedWorkdays.reduce((s, p) => s + p.present, 0);
  const totalPresent = series.reduce((s, p) => s + p.present, 0), totalMinutes = series.reduce((s, p) => s + p.minutes, 0);
  return {
    range: { from, to, today, since: since ?? null },
    kpis: {
      people: people.length, insideNow: stats.filter(s => s.insideNow).length,
      attendanceRate: expected ? presentOnWorkdays / expected : null,
      onTimeRate: totalPresent ? series.reduce((s, p) => s + p.onTime, 0) / totalPresent : null,
      averageMinutes: totalPresent ? Math.round(totalMinutes / totalPresent) : 0, totalMinutes,
      lateDays: series.reduce((s, p) => s + p.late, 0), absentDays: series.reduce((s, p) => s + p.absent, 0),
      medianArrival: median(arrivals), medianDeparture: median(departures),
    },
    daily: series,
    arrivals: histogram(arrivals, ARRIVAL_FROM, ARRIVAL_TO), departures: histogram(departures, DEPART_FROM, DEPART_TO),
    weekHours: occupancy.map((hours, weekday) => hours.map(total => weekdayCount[weekday] ? Math.round((total / weekdayCount[weekday]) * 10) / 10 : 0)),
    doors: [...doors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([door, count]) => ({ door, count })),
    people: stats.sort((a, b) => b.minutes - a.minutes),
  };
}

/** GitHub-style contribution grid: the 53 weeks ending on `to`, one cell per day. */
export function contributions(attendance: Attendance, config: Config, to: string, key: string | null, now = Date.now()) {
  const end = new Date(`${to}T12:00:00Z`); const endOfWeek = addDays(to, 6 - end.getUTCDay());
  const from = addDays(endOfWeek, -(53 * 7) + 1);
  const result = analyze(attendance, config, from, endOfWeek, key, now);
  return { from, to: endOfWeek, days: result.daily.map(p => ({ date: p.date, minutes: p.minutes, present: p.present, tracked: p.tracked, workday: p.workday })), people: result.kpis.people };
}
