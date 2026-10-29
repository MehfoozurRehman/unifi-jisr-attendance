import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrivalDots, DailyAttendance, DailyHours, DayTimeline, DoorList, Ring, STATUS, TimeHistogram, WeekHours, YearGrid, type DailyPoint, type Day } from './charts';
import { clock, duration, hoursOnly, longDate, minuteClock, percent, shortDate, t, type Lang } from './i18n';

export type Person = { key: string; name: string | null; email: string | null; userId: string | null; employeeCode: string | null; department: string | null; managerEmail: string | null };
type PersonStats = { person: Person; present: number; green: number; yellow: number; red: number; late: number; minutes: number; averageMinutes: number; medianArrival: number | null; insideNow: boolean; days?: Day[] };
type Rules = { workStartMinutes: number; lateGraceMinutes: number; requiredMinutes: number; weekendDays: number[] };
type Analytics = {
  range: { from: string; to: string; today: string; since: string | null };
  kpis: { people: number; insideNow: number; attendanceRate: number | null; onTimeRate: number | null; averageMinutes: number; totalMinutes: number; lateDays: number; absentDays: number; medianArrival: number | null; medianDeparture: number | null };
  daily: DailyPoint[]; arrivals: { start: number; count: number }[]; departures: { start: number; count: number }[]; weekHours: number[][];
  doors: { door: string; count: number }[]; people: PersonStats[]; rules: Rules;
};
type Grid = { from: string; to: string; days: { date: string; minutes: number; present: number; tracked: boolean; workday: boolean }[] };

/* ---------- range ---------- */
export type Preset = '7' | '30' | '90' | 'month' | 'year' | 'custom';
export type Range = { preset: Preset; from: string; to: string };
const riyadhToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
const minus = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
export const presetRange = (preset: Preset, custom?: { from: string; to: string }): Range => {
  const today = riyadhToday();
  if (preset === 'custom' && custom) return { preset, ...custom };
  if (preset === 'month') return { preset, from: `${today.slice(0, 8)}01`, to: today };
  if (preset === 'year') return { preset, from: `${today.slice(0, 4)}-01-01`, to: today };
  const days = Number(preset === 'custom' ? '30' : preset);
  return { preset, from: minus(today, days - 1), to: today };
};

export function RangePicker({ lang, range, onChange }: { lang: Lang; range: Range; onChange: (r: Range) => void }) {
  const w = t(lang); const [open, setOpen] = useState(false); const [from, setFrom] = useState(range.from); const [to, setTo] = useState(range.to);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close); }, []);
  const labels: Record<Exclude<Preset, 'custom'>, string> = { '7': w.last7, '30': w.last30, '90': w.last90, month: w.thisMonth, year: w.thisYear };
  const current = range.preset === 'custom' ? `${shortDate(lang, range.from)} – ${shortDate(lang, range.to)}` : labels[range.preset];
  return <div className="range" ref={box}>
    <button className="range-btn" onClick={() => setOpen(!open)} aria-expanded={open}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2Zm-2 8h14v10H5Z" /></svg>{current}</button>
    {open && <div className="range-menu" role="listbox">
      {(Object.keys(labels) as Exclude<Preset, 'custom'>[]).map(p => <button key={p} role="option" aria-selected={range.preset === p} className={range.preset === p ? 'on' : ''} onClick={() => { onChange(presetRange(p)); setOpen(false); }}>{labels[p]}{range.preset === p && <b>✓</b>}</button>)}
      <div className="range-custom"><span>{w.custom}</span><label>{w.from}<input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} /></label><label>{w.to}<input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} /></label><button className="apply" onClick={() => { if (from && to) { onChange(presetRange('custom', { from, to })); setOpen(false); } }}>{w.apply}</button></div>
    </div>}
  </div>;
}

/* ---------- shared bits ---------- */
const get = async <T,>(url: string): Promise<T> => { const r = await fetch(url); if (!r.ok) throw new Error(String(r.status)); return r.json(); };
function useData<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null); const [loading, setLoading] = useState(false);
  useEffect(() => { if (!url) return; let live = true; const load = () => { setLoading(true); get<T>(url).then(d => { if (live) setData(d); }).catch(() => {}).finally(() => { if (live) setLoading(false); }); }; load(); const timer = setInterval(load, 60_000); return () => { live = false; clearInterval(timer); }; }, [url]);
  return { data, loading };
}
export const initials = (name: string | null) => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
export const go = (hash: string) => { location.hash = hash; };
const Card = ({ title, extra, className = '', children }: { title?: string; extra?: React.ReactNode; className?: string; children: React.ReactNode }) =>
  <section className={`card ${className}`}>{(title || extra) && <header className="card-head"><h3>{title}</h3>{extra}</header>}{children}</section>;
const Kpi = ({ value, label, tone }: { value: string; label: string; tone?: 'good' | 'warning' | 'critical' }) =>
  <section className="card kpi"><strong>{value}</strong><span>{tone && <i style={{ background: STATUS[tone] }} />}{label}</span></section>;
const rulesText = (lang: Lang, r?: Rules) => r ? t(lang).rules(minuteClock(r.workStartMinutes), r.lateGraceMinutes, duration(lang, r.requiredMinutes)) : '';

export function PeopleStrip({ lang, people, active }: { lang: Lang; people: PersonStats[]; active?: string }) {
  const w = t(lang), row = useRef<HTMLDivElement>(null);
  const scroll = (d: number) => row.current?.scrollBy({ left: d * (lang === 'ar' ? -1 : 1) * 320, behavior: 'smooth' });
  return <div className="strip-wrap">
    <div className="team-title"><h2>{w.team}</h2><span>{w.members(people.length)}</span></div>
    <div className="people-strip"><button className="nav" aria-label="‹" onClick={() => scroll(-1)}>‹</button>
      <div className="strip-row" ref={row}>{people.map(p => <button key={p.person.key} className={`face${active === p.person.key ? ' active' : ''}`} title={p.person.name ?? ''} onClick={() => go(`#/employee/${encodeURIComponent(p.person.key)}`)}><span className="avatar">{initials(p.person.name)}</span>{p.insideNow && <i className="live-dot" />}</button>)}</div>
      <button className="nav" aria-label="›" onClick={() => scroll(1)}>›</button></div>
  </div>;
}

/* ---------- team dashboard ---------- */
export function Dashboard({ lang, range }: { lang: Lang; range: Range }) {
  const w = t(lang);
  const { data, loading } = useData<Analytics>(`/api/admin/analytics?from=${range.from}&to=${range.to}`);
  const { data: grid } = useData<Grid>(`/api/admin/contributions?to=${range.to}`);
  const [sort, setSort] = useState<'minutes' | 'present' | 'onTime' | 'average' | 'arrival'>('minutes');
  const rows = useMemo(() => [...(data?.people ?? [])].sort((a, b) => sort === 'present' ? b.present - a.present : sort === 'onTime' ? (b.present ? b.green / b.present : 0) - (a.present ? a.green / a.present : 0) : sort === 'average' ? b.averageMinutes - a.averageMinutes : sort === 'arrival' ? (a.medianArrival ?? 9e9) - (b.medianArrival ?? 9e9) : b.minutes - a.minutes), [data, sort]);
  if (!data) return <div className="loading">…</div>;
  const k = data.kpis;
  return <div className={`page${loading ? ' refreshing' : ''}`}>
    <PeopleStrip lang={lang} people={data.people} />
    <div className="grid">
      <section className="card hero span-4">
        <div><span className="eyebrow">{w.insideNow}</span><strong className="big">{k.insideNow}<small> {w.of} {k.people}</small></strong><p>{data.range.since ? w.recordingSince(longDate(lang, data.range.since)) : ''}</p></div>
        <Ring value={k.insideNow} total={k.people} />
      </section>
      <div className="kpis span-8">
        <Kpi value={percent(k.attendanceRate)} label={w.attendanceRate} />
        <Kpi value={percent(k.onTimeRate)} label={w.onTimeRate} tone="good" />
        <Kpi value={duration(lang, k.averageMinutes)} label={w.averageDay} />
        <Kpi value={hoursOnly(k.totalMinutes)} label={`${w.totalHours}`} />
        <Kpi value={String(k.lateDays)} label={w.lateDays} tone="warning" />
        <Kpi value={String(k.absentDays)} label={w.absentDays} tone="critical" />
      </div>
      <Card title={w.dailyAttendance} className="span-8"><DailyAttendance lang={lang} data={data.daily} /></Card>
      <Card title={w.weeklyActivity} className="span-4"><WeekHours lang={lang} matrix={data.weekHours} fromHour={7} toHour={20} /></Card>
      <Card title={w.yearActivity} className="span-12">{grid ? <YearGrid lang={lang} days={grid.days} /> : <div className="loading">…</div>}</Card>
      <Card title={w.arrivals} extra={<span className="pill">{w.medianArrival} {minuteClock(k.medianArrival)}</span>} className="span-4"><TimeHistogram lang={lang} bins={data.arrivals} title={w.arrivals} marker={data.rules.workStartMinutes + data.rules.lateGraceMinutes} /></Card>
      <Card title={w.departures} extra={<span className="pill">{w.medianDeparture} {minuteClock(k.medianDeparture)}</span>} className="span-4"><TimeHistogram lang={lang} bins={data.departures} title={w.departures} /></Card>
      <Card title={w.doors} extra={<span className="pill">{data.doors.length}</span>} className="span-4"><DoorList lang={lang} doors={data.doors} /></Card>
      <Card title={w.people} className="span-12">
        <div className="table-wrap"><table className="people">
          <thead><tr><th>{w.employee}</th>{([['present', w.present], ['onTime', w.onTimeRate], ['average', w.averageDay], ['arrival', w.medianArrival], ['minutes', w.hours]] as const).map(([key, label]) => <th key={key}><button className={sort === key ? 'on' : ''} onClick={() => setSort(key)}>{label}</button></th>)}<th>{w.today}</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.person.key} tabIndex={0} onClick={() => go(`#/employee/${encodeURIComponent(r.person.key)}`)} onKeyDown={e => { if (e.key === 'Enter') go(`#/employee/${encodeURIComponent(r.person.key)}`); }}>
            <td><div className="who"><span className="avatar">{initials(r.person.name)}</span><span><b>{r.person.name}</b><small>{r.person.email || w.noEmail}</small></span></div></td>
            <td>{r.present}</td>
            <td><div className="bar-cell"><span style={{ inlineSize: `${r.present ? (r.green / r.present) * 100 : 0}%` }} /></div>{r.present ? percent(r.green / r.present) : '—'}</td>
            <td>{duration(lang, r.averageMinutes)}</td><td>{minuteClock(r.medianArrival)}</td><td>{hoursOnly(r.minutes)}</td>
            <td>{r.insideNow ? <span className="state in"><i />{w.inside}</span> : <span className="state">{'—'}</span>}</td>
          </tr>)}</tbody></table></div>
        <p className="foot">{rulesText(lang, data.rules)}</p>
      </Card>
    </div>
  </div>;
}

/* ---------- employee page ---------- */
export function Employee({ lang, range, personKey }: { lang: Lang; range: Range; personKey: string }) {
  const w = t(lang);
  const { data, loading } = useData<Analytics>(`/api/admin/analytics/person?person=${encodeURIComponent(personKey)}&from=${range.from}&to=${range.to}`);
  const { data: team } = useData<Analytics>(`/api/admin/analytics?from=${range.to}&to=${range.to}`);
  const { data: grid } = useData<Grid>(`/api/admin/contributions?person=${encodeURIComponent(personKey)}&to=${range.to}`);
  if (!data) return <div className="loading">…</div>;
  const me = data.people[0];
  if (!me) return <div className="page"><button className="back" onClick={() => go('#/')}>{w.back}</button><p className="card">{w.notFound}</p></div>;
  const days = me.days ?? [], p = me.person;
  const today = days.find(d => d.date === data.range.today);
  const taps = days.flatMap(d => d.taps.map(tap => ({ ...tap, date: d.date }))).slice(-12).reverse();
  return <div className={`page${loading ? ' refreshing' : ''}`}>
    {team && <PeopleStrip lang={lang} people={team.people} active={personKey} />}
    <div className="grid">
      <section className="card profile span-4">
        <div className="profile-face"><span className="avatar xl">{initials(p.name)}</span>{today?.inside && <span className="live-tag"><i />{w.inside} · {w.since} {clock(lang, today.firstIn)}</span>}</div>
        <div className="profile-info"><div><h2>{p.name}</h2><span>{p.email || w.noEmail}</span><small>{p.department ? `${w.department}: ${p.department}` : w.jisrPending}</small></div>{p.email && <a className="icon-btn" href={`mailto:${p.email}`} aria-label={w.email}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18v14H3Zm2 2v.5l7 4.5 7-4.5V7Zm14 10V9.8l-7 4.5-7-4.5V17Z" /></svg></a>}</div>
      </section>
      <div className="kpis span-8">
        <Kpi value={String(me.present)} label={w.daysPresent} />
        <Kpi value={me.present ? percent(me.green / me.present) : '—'} label={w.onTimeRate} tone="good" />
        <Kpi value={duration(lang, me.averageMinutes)} label={w.averageDay} />
        <Kpi value={hoursOnly(me.minutes)} label={w.totalHours} />
        <Kpi value={minuteClock(me.medianArrival)} label={w.medianArrival} tone="warning" />
        <Kpi value={String(me.red)} label={w.absentDays} tone="critical" />
      </div>
      <Card title={w.dailyHours} extra={<span className="pill">{w.required} {duration(lang, data.rules.requiredMinutes)}</span>} className="span-8"><DailyHours lang={lang} days={days} required={data.rules.requiredMinutes} /></Card>
      <Card title={w.arrivals} extra={<span className="pill">{w.medianArrival} {minuteClock(me.medianArrival)}</span>} className="span-4"><ArrivalDots lang={lang} days={days} start={data.rules.workStartMinutes} grace={data.rules.lateGraceMinutes} /></Card>
      <Card title={w.yearActivity} className="span-12">{grid ? <YearGrid lang={lang} days={grid.days} perPerson /> : <div className="loading">…</div>}</Card>
      <Card title={w.timeline} className="span-8"><DayTimeline lang={lang} days={days} /></Card>
      <Card title={w.weeklyActivity} className="span-4"><WeekHours lang={lang} matrix={data.weekHours} fromHour={7} toHour={20} /></Card>
      <Card title={w.recentTaps} className="span-6"><ol className="taps">{taps.map(tap => <li key={tap.at} className={tap.direction}><b>{tap.direction === 'in' ? w.in : w.out}</b><span>{shortDate(lang, tap.date)}</span><strong>{clock(lang, tap.at)}</strong></li>)}{!taps.length && <li className="muted">{w.noData}</li>}</ol></Card>
      <Card title={w.doors} className="span-6"><DoorList lang={lang} doors={data.doors} /><p className="foot">{rulesText(lang, data.rules)}</p></Card>
    </div>
  </div>;
}
