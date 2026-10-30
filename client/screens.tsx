import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrivalDots, DailyAttendance, DailyHours, DayTimeline, DoorList, LiveTimer, RankBars, Rings, STATUS, OUTSIDE, TimeHistogram, WeekBoard, WorkActivity, YearGrid, type BoardCard, type DailyPoint, type Day, type LiveRow, type RankItem } from './charts';
import { clock, duration, longDate, minuteClock, percent, shortDate, t, type Lang } from './i18n';

/* ---------- types from the API ---------- */
export type Member = { key: string; employeeId: string | null; name: string; nameAr: string | null; email: string | null; titleEn: string | null; titleAr: string | null; function: string | null; department: string | null; officeNumber: string | null; inDirectory: boolean };
type Stats = { member: Member; expected: number; present: number; green: number; yellow: number; red: number; late: number; minutes: number; averageMinutes: number; outsideMinutes: number; averageOutside: number; breaks: number; averageBreaks: number; lateMinutes: number; overtimeMinutes: number; medianArrival: number | null; medianDeparture: number | null; attendanceRate: number | null; onTimeRate: number | null; streak: number; bestStreak: number; today: { inside: boolean; firstIn: number | null; lastOut: number | null; minutes: number; status: string }; days?: Day[] };
type Group = { name: string; function: string | null; people: number; insideNow: number; attendanceRate: number | null; onTimeRate: number | null; averageMinutes: number; averageOutside: number; lateDays: number; absentDays: number; medianArrival: number | null };
type Rules = { workStartMinutes: number; lateGraceMinutes: number; requiredMinutes: number; weekendDays: number[] };
type Analytics = {
  range: { from: string; to: string; today: string; since: string | null };
  kpis: { people: number; insideNow: number; leftToday: number; attendanceRate: number | null; onTimeRate: number | null; averageMinutes: number; totalMinutes: number; averageOutside: number; averageBreaks: number; lateDays: number; absentDays: number; overtimeMinutes: number; medianArrival: number | null; medianDeparture: number | null };
  daily: DailyPoint[]; arrivals: { start: number; count: number }[]; departures: { start: number; count: number }[]; weekHours: number[][];
  doors: { door: string; count: number }[]; people: Stats[]; departments: Group[]; functions: Group[]; unmatched: { key: string; name: string | null; taps: number }[];
  rules: Rules; functionNames: Record<string, string>;
};
type Grid = { days: { date: string; minutes: number; present: number; tracked: boolean; workday: boolean }[] };
export type Me = { username: string; displayName: string; role: 'admin' | 'hr'; bootstrap: boolean };

/* ---------- range ---------- */
export type Preset = 'today' | '7' | '30' | '90' | 'month' | 'year' | 'custom';
export type Range = { preset: Preset; from: string; to: string };
const riyadhToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
const shift = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
export const presetRange = (preset: Preset, custom?: { from: string; to: string }): Range => {
  const today = riyadhToday();
  if (preset === 'custom' && custom) return { preset, ...custom };
  if (preset === 'today') return { preset, from: today, to: today };
  if (preset === 'month') return { preset, from: `${today.slice(0, 8)}01`, to: today };
  if (preset === 'year') return { preset, from: `${today.slice(0, 4)}-01-01`, to: today };
  return { preset, from: shift(today, -(Number(preset === 'custom' ? '30' : preset) - 1)), to: today };
};
export function RangePicker({ lang, range, onChange }: { lang: Lang; range: Range; onChange: (r: Range) => void }) {
  const w = t(lang); const [open, setOpen] = useState(false); const [from, setFrom] = useState(range.from); const [to, setTo] = useState(range.to);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close); }, []);
  const labels: Record<Exclude<Preset, 'custom'>, string> = { today: w.today, '7': w.last7, '30': w.last30, '90': w.last90, month: w.thisMonth, year: w.thisYear };
  const current = range.preset === 'custom' ? `${shortDate(lang, range.from)} – ${shortDate(lang, range.to)}` : labels[range.preset];
  return <div className="range" ref={box}>
    <button className="pill-btn" onClick={() => setOpen(!open)} aria-expanded={open}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2Zm-2 8h14v10H5Z" /></svg>{current}</button>
    {open && <div className="range-menu" role="listbox">
      {(Object.keys(labels) as Exclude<Preset, 'custom'>[]).map(p => <button key={p} role="option" aria-selected={range.preset === p} className={range.preset === p ? 'on' : ''} onClick={() => { onChange(presetRange(p)); setOpen(false); }}>{labels[p]}{range.preset === p && <b>✓</b>}</button>)}
      <div className="range-custom"><span>{w.custom}</span><label>{w.from}<input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} /></label><label>{w.to}<input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} /></label><button className="apply" onClick={() => { if (from && to) { onChange(presetRange('custom', { from, to })); setOpen(false); } }}>{w.apply}</button></div>
    </div>}
  </div>;
}

/* ---------- helpers ---------- */
const get = async <T,>(url: string): Promise<T> => { const r = await fetch(url); if (!r.ok) throw new Error(String(r.status)); return r.json(); };
function useData<T>(url: string | null) {
  const [state, setState] = useState<{ data: T | null; at: number }>({ data: null, at: 0 }); const [loading, setLoading] = useState(false);
  useEffect(() => { if (!url) return; let live = true; const load = () => { setLoading(true); get<T>(url).then(d => { if (live) setState({ data: d, at: Date.now() }); }).catch(() => {}).finally(() => { if (live) setLoading(false); }); }; load(); const timer = setInterval(load, 60_000); return () => { live = false; clearInterval(timer); }; }, [url]);
  return { data: state.data, fetchedAt: state.at, loading };
}
export const initials = (name: string | null) => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
export const go = (hash: string) => { location.hash = hash; };
const personHash = (m: Member) => `#/employee/${encodeURIComponent(m.employeeId ?? m.key)}`;
const deptHash = (name: string) => `#/department/${encodeURIComponent(name)}`;
const nameOf = (lang: Lang, m: Member) => (lang === 'ar' && m.nameAr) || m.name;
const titleOf = (lang: Lang, m: Member) => (lang === 'ar' && m.titleAr) || m.titleEn || '';
const fnName = (lang: Lang, names: Record<string, string> | undefined, fn: string | null) => !fn ? '' : (lang === 'ar' && names?.[fn]) || fn;
const qs = (range: { from: string; to: string }, extra: Record<string, string> = {}) => new URLSearchParams({ from: range.from, to: range.to, ...extra }).toString();
const weekOf = (date: string) => { const start = shift(date, -new Date(`${date}T12:00:00Z`).getUTCDay()); return { from: start, to: shift(start, 6) }; };
const Card = ({ title, extra, className = '', children }: { title?: string; extra?: React.ReactNode; className?: string; children: React.ReactNode }) =>
  <section className={`card ${className}`}>{(title || extra) && <header className="card-head"><h3>{title}</h3>{extra}</header>}{children}</section>;
const Tile = ({ value, label, tone, hint, wide }: { value: string; label: string; tone?: 'good' | 'warning' | 'critical' | 'outside'; hint?: string; wide?: boolean }) =>
  <section className={`card tile${wide ? ' wide' : ''}`}><strong>{value}</strong><span>{tone && <i style={{ background: tone === 'outside' ? OUTSIDE : STATUS[tone] }} />}{label}</span>{hint && <small>{hint}</small>}</section>;
const rulesText = (lang: Lang, r?: Rules) => r ? t(lang).rules(minuteClock(r.workStartMinutes), r.lateGraceMinutes, duration(lang, r.requiredMinutes)) : '';
const Loading = () => <div className="loading" aria-busy="true"><span /></div>;
function Pills<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return <div className="pills" role="tablist">{options.map(([v, l]) => <button key={v} role="tab" aria-selected={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>)}</div>;
}

/* ---------- title row (concept: "Capture IT · Developers" + faces + action) ---------- */
export function TitleRow({ lang, title, sub, people, active, actions }: { lang: Lang; title: string; sub: string; people: Stats[]; active?: string; actions?: React.ReactNode }) {
  const row = useRef<HTMLDivElement>(null);
  const sorted = useMemo(() => [...people].sort((a, b) => Number(b.today.inside) - Number(a.today.inside) || (b.today.minutes - a.today.minutes)), [people]);
  const scroll = (d: number) => row.current?.scrollBy({ left: d * (lang === 'ar' ? -1 : 1) * 300, behavior: 'smooth' });
  return <div className="title-row">
    <div className="title"><h1>{title}</h1><span>{sub}</span></div>
    <div className="faces"><button className="round" aria-label="‹" onClick={() => scroll(-1)}>‹</button>
      <div className="faces-row" ref={row}>{sorted.map(p => <button key={p.member.key} className={`face${active === p.member.key ? ' active' : ''}`} title={nameOf(lang, p.member)} onClick={() => go(personHash(p.member))}><span className="avatar">{initials(p.member.name)}</span>{p.today.inside && <i className="live-dot" />}</button>)}</div>
      <button className="round" aria-label="›" onClick={() => scroll(1)}>›</button></div>
    <div className="title-actions">{actions}</div>
  </div>;
}

/* ---------- leaderboard ---------- */
type Board = 'punctual' | 'streak' | 'hours' | 'late' | 'outside';
function Leaderboard({ lang, people }: { lang: Lang; people: Stats[] }) {
  const w = t(lang); const [board, setBoard] = useState<Board>('punctual');
  const eligible = people.filter(p => p.present >= 3);
  const item = (p: Stats, value: number, display: string): RankItem => ({ key: p.member.key, label: nameOf(lang, p.member), sub: p.member.department ?? undefined, value, display, onClick: () => go(personHash(p.member)) });
  const lists: Record<Board, RankItem[]> = {
    punctual: [...eligible].sort((a, b) => (b.onTimeRate ?? 0) - (a.onTimeRate ?? 0) || (a.medianArrival ?? 9e9) - (b.medianArrival ?? 9e9)).slice(0, 6).map(p => item(p, p.onTimeRate ?? 0, percent(p.onTimeRate))),
    streak: [...eligible].sort((a, b) => b.bestStreak - a.bestStreak).slice(0, 6).map(p => item(p, p.bestStreak, String(p.bestStreak))),
    hours: [...eligible].sort((a, b) => b.averageMinutes - a.averageMinutes).slice(0, 6).map(p => item(p, p.averageMinutes, duration(lang, p.averageMinutes))),
    late: [...eligible].filter(p => p.lateMinutes > 0).sort((a, b) => b.lateMinutes - a.lateMinutes).slice(0, 6).map(p => item(p, p.lateMinutes, duration(lang, p.lateMinutes))),
    outside: [...eligible].filter(p => p.averageOutside > 0).sort((a, b) => b.averageOutside - a.averageOutside).slice(0, 6).map(p => item(p, p.averageOutside, duration(lang, p.averageOutside))),
  };
  const tone: Record<Board, 'good' | 'sand' | 'warning' | 'outside'> = { punctual: 'good', streak: 'good', hours: 'sand', late: 'warning', outside: 'outside' };
  return <>
    <Pills value={board} onChange={setBoard} options={[['punctual', w.mostPunctual], ['streak', w.longestStreak], ['hours', w.mostHours], ['late', w.mostLate], ['outside', w.mostOutside]]} />
    <RankBars items={lists[board]} tone={tone[board]} max={board === 'punctual' ? 1 : undefined} empty={w.noData} />
    <p className="foot">{w.minDays}</p>
  </>;
}

/* ---------- group comparison ---------- */
type GroupMetric = 'attendance' | 'onTime' | 'average' | 'outside';
function GroupCompare({ lang, groups, names, link }: { lang: Lang; groups: Group[]; names: Record<string, string>; link?: (g: Group) => string }) {
  const w = t(lang); const [metric, setMetric] = useState<GroupMetric>('attendance');
  const value = (g: Group) => metric === 'attendance' ? g.attendanceRate ?? 0 : metric === 'onTime' ? g.onTimeRate ?? 0 : metric === 'average' ? g.averageMinutes : g.averageOutside;
  const display = (g: Group) => metric === 'attendance' ? percent(g.attendanceRate) : metric === 'onTime' ? percent(g.onTimeRate) : duration(lang, value(g));
  const items: RankItem[] = [...groups].filter(g => g.name !== '—').sort((a, b) => metric === 'outside' ? value(a) - value(b) : value(b) - value(a)).map(g => ({ key: g.name, label: link ? g.name : fnName(lang, names, g.name), sub: `${t(lang).members(g.people)} · ${g.insideNow} ${w.inside}`, value: value(g), display: display(g), onClick: link ? () => go(link(g)) : undefined }));
  return <>
    <Pills value={metric} onChange={setMetric} options={[['attendance', w.attendanceRate], ['onTime', w.onTimeRate], ['average', w.averageDay], ['outside', w.averageOutside]]} />
    <RankBars items={items} tone={metric === 'outside' ? 'outside' : metric === 'onTime' ? 'good' : 'sand'} max={metric === 'attendance' || metric === 'onTime' ? 1 : undefined} empty={w.noData} />
  </>;
}

/* ---------- members table ---------- */
type Sort = 'name' | 'attendance' | 'onTime' | 'average' | 'outside' | 'breaks' | 'arrival';
export function MembersTable({ lang, people }: { lang: Lang; people: Stats[] }) {
  const w = t(lang); const [sort, setSort] = useState<Sort>('attendance');
  const rows = useMemo(() => [...people].sort((a, b) => {
    switch (sort) {
      case 'name': return nameOf(lang, a.member).localeCompare(nameOf(lang, b.member));
      case 'onTime': return (b.onTimeRate ?? -1) - (a.onTimeRate ?? -1);
      case 'average': return b.averageMinutes - a.averageMinutes;
      case 'outside': return b.averageOutside - a.averageOutside;
      case 'breaks': return b.averageBreaks - a.averageBreaks;
      case 'arrival': return (a.medianArrival ?? 9e9) - (b.medianArrival ?? 9e9);
      default: return (b.attendanceRate ?? -1) - (a.attendanceRate ?? -1);
    }
  }), [people, sort, lang]);
  const head: [Sort, string][] = [['name', w.employee], ['attendance', w.attendanceRate], ['onTime', w.onTimeRate], ['average', w.averageDay], ['outside', w.outside], ['breaks', w.breaks], ['arrival', w.medianArrival]];
  return <div className="table-wrap"><table className="people">
    <thead><tr>{head.map(([k, l]) => <th key={k}><button className={sort === k ? 'on' : ''} onClick={() => setSort(k)}>{l}</button></th>)}<th>{w.today}</th></tr></thead>
    <tbody>{rows.map(r => <tr key={r.member.key} tabIndex={0} onClick={() => go(personHash(r.member))} onKeyDown={e => { if (e.key === 'Enter') go(personHash(r.member)); }}>
      <td><div className="who"><span className="avatar">{initials(r.member.name)}</span><span><b>{nameOf(lang, r.member)}</b><small>{titleOf(lang, r.member) || r.member.email || w.noEmail}{r.member.department ? ` · ${r.member.department}` : ''}</small></span></div></td>
      <td><div className="bar-cell"><span style={{ inlineSize: `${(r.attendanceRate ?? 0) * 100}%`, background: 'var(--sand)' }} /></div>{percent(r.attendanceRate)}</td>
      <td><div className="bar-cell"><span style={{ inlineSize: `${(r.onTimeRate ?? 0) * 100}%` }} /></div>{percent(r.onTimeRate)}</td>
      <td>{duration(lang, r.averageMinutes)}</td><td>{duration(lang, r.averageOutside)}</td><td>{r.averageBreaks}</td><td>{minuteClock(r.medianArrival)}</td>
      <td>{r.today.inside ? <span className="state in"><i />{w.inside} · {clock(lang, r.today.firstIn)}</span> : r.today.firstIn ? <span className="state">{w.left} {clock(lang, r.today.lastOut)}</span> : <span className="state">{w.notIn}</span>}</td>
    </tr>)}</tbody></table>{!rows.length && <p className="muted">{w.noData}</p>}</div>;
}

/* ---------- week board cards ---------- */
const waveCards = (lang: Lang, week: Analytics | null): BoardCard[] => {
  if (!week) return [];
  const w = t(lang), cards: BoardCard[] = [];
  week.daily.forEach((d, day) => {
    const a = d.waves.arrival, b = d.waves.breakOut, dep = d.waves.departure;
    if (a.count && a.median !== null) cards.push({ day, start: a.median - 25, end: a.median + 35, title: w.arrivalWave, sub: `${minuteClock(a.median)} · ${w.peopleN(a.count)}`, tone: 'sand', avatars: a.first.map(f => f.name) });
    if (b.count && b.median !== null) cards.push({ day, start: b.median - 15, end: b.median + 40, title: w.breakWave, sub: `${minuteClock(b.median)} · ${w.peopleN(b.count)}`, tone: 'outside' });
    if (dep.count && dep.median !== null) cards.push({ day, start: dep.median - 30, end: dep.median + 30, title: w.departureWave, sub: `${minuteClock(dep.median)} · ${w.peopleN(dep.count)}`, tone: 'dark' });
  });
  return cards;
};
const sessionCards = (lang: Lang, days: Day[], week: { from: string; to: string }): BoardCard[] => {
  const w = t(lang), cards: BoardCard[] = [];
  const mod = (at: number) => { const [h, m] = clock('en', at).split(':').map(Number); return h * 60 + m; };
  days.filter(d => d.date >= week.from && d.date <= week.to).forEach(d => {
    const day = new Date(`${d.date}T12:00:00Z`).getUTCDay(); let open: number | null = null;
    const push = (a: number, b: number) => cards.push({ day, start: mod(a), end: mod(b), title: w.session, sub: `${clock(lang, a)} – ${clock(lang, b)}`, tone: d.status === 'yellow' ? 'dark' : 'sand' });
    for (const tap of d.taps) { if (tap.direction === 'in') { if (open === null) open = tap.at; } else if (open !== null) { push(open, tap.at); open = null; } }
    if (open !== null && d.inside) push(open, Date.now());
  });
  return cards;
};

/* ---------- overview used by company and department ---------- */
function Overview({ lang, data, fetchedAt, grid, week, companyLevel }: { lang: Lang; data: Analytics; fetchedAt: number; grid: Grid | null; week: Analytics | null; companyLevel: boolean }) {
  const w = t(lang), k = data.kpis;
  const expected = data.people.reduce((s, p) => s + p.expected, 0) || 1;
  const sum = (f: (p: Stats) => number) => data.people.reduce((s, p) => s + f(p), 0);
  const live: LiveRow[] = [...data.people].filter(p => p.today.firstIn !== null).sort((a, b) => Number(b.today.inside) - Number(a.today.inside) || b.today.minutes - a.today.minutes)
    .map(p => ({ key: p.member.key, name: nameOf(lang, p.member), sub: p.member.department ?? '', minutesAtFetch: p.today.minutes, inside: p.today.inside, onClick: () => go(personHash(p.member)) }));
  const weekRange = weekOf(data.range.to);
  const weekDays = Array.from({ length: 7 }, (_, i) => shift(weekRange.from, i));
  return <div className="grid">
    <section className="card span-3 accent-card"><LiveTimer lang={lang} title={w.longestInside} rows={live} fetchedAt={fetchedAt} emptyLabel={w.nobodyInside} /></section>
    <Card title={w.attendanceMix} className="span-3"><Rings center={percent(k.attendanceRate)} centerLabel={w.attendanceRate} parts={[{ label: w.onTime, value: sum(p => p.green) / expected, color: STATUS.good }, { label: w.late, value: sum(p => p.yellow) / expected, color: STATUS.warning }, { label: w.absent, value: sum(p => p.red) / expected, color: STATUS.critical }]} /></Card>
    <div className="tiles span-3">
      <Tile value={`${k.insideNow}`} label={`${w.insideNow} · ${w.of} ${k.people}`} tone="good" />
      <Tile value={percent(k.onTimeRate)} label={w.onTimeRate} />
      <Tile wide value={duration(lang, k.averageMinutes)} label={w.averageDay} hint={`${w.averageOutside} ${duration(lang, k.averageOutside)} · ${k.averageBreaks} ${w.breaks} ${w.perDay}`} />
    </div>
    <div className="stack span-3 row-2">
      <Card title={w.weeklyActivity} extra={<span className="pill">{w.medianArrival} {minuteClock(k.medianArrival)}</span>} className="grow"><WorkActivity lang={lang} matrix={data.weekHours} /></Card>
      <Card title={w.doors} extra={<span className="pill">{data.doors.length}</span>}><DoorList lang={lang} doors={data.doors.slice(0, 5)} /></Card>
    </div>
    <Card title={w.weekOverview} extra={<span className="pill">{shortDate(lang, weekRange.from)} – {shortDate(lang, weekRange.to)}</span>} className="span-9"><WeekBoard lang={lang} days={weekDays} today={data.range.today} cards={waveCards(lang, week)} /></Card>
    <Card title={w.dailyAttendance} className="span-8 chart-card"><DailyAttendance lang={lang} data={data.daily} /></Card>
    <Card title={w.leaders} className="span-4"><Leaderboard lang={lang} people={data.people} /></Card>
    <Card title={w.yearActivity} className="span-12"><>{grid ? <YearGrid lang={lang} days={grid.days} /> : <Loading />}</></Card>
    {/* Arrivals and departures side by side, then departments (company) or people (department) across the full width. */}
    <Card title={w.arrivals} className="span-6 chart-card"><TimeHistogram lang={lang} bins={data.arrivals} title={w.arrivals} marker={data.rules.workStartMinutes + data.rules.lateGraceMinutes} /></Card>
    <Card title={w.departures} extra={<span className="pill">{minuteClock(k.medianDeparture)}</span>} className="span-6 chart-card"><TimeHistogram lang={lang} bins={data.departures} title={w.departures} /></Card>
    {companyLevel
      ? <Card title={w.byDepartment} className="span-12"><GroupCompare lang={lang} groups={data.departments} names={data.functionNames} link={g => deptHash(g.name)} /></Card>
      : <Card title={w.people} className="span-12"><MembersTable lang={lang} people={data.people} /></Card>}
    <p className="foot span-12">{rulesText(lang, data.rules)}</p>
  </div>;
}

/* ---------- screens ---------- */
type ScreenProps = { lang: Lang; range: Range; onRange: (r: Range) => void };
export function Company({ lang, range, onRange, me, onImport }: ScreenProps & { me: Me; onImport: () => void }) {
  const w = t(lang);
  const { data, fetchedAt, loading } = useData<Analytics>(`/api/admin/analytics?${qs(range)}`);
  const { data: grid } = useData<Grid>(`/api/admin/contributions?${qs(range)}`);
  const { data: week } = useData<Analytics>(`/api/admin/analytics?${qs(weekOf(range.to))}`);
  if (!data) return <Loading />;
  const noList = data.people.every(p => !p.member.inDirectory);
  return <div className={`page${loading ? ' refreshing' : ''}`}>
    <TitleRow lang={lang} title={`${w.companyName} · ${w.company}`} sub={w.members(data.kpis.people)} people={data.people}
      actions={<><RangePicker lang={lang} range={range} onChange={onRange} />{me.role === 'admin' && <button className="pill-btn light" onClick={onImport}><span aria-hidden="true">＋</span>{w.upload}</button>}</>} />
    {noList && <div className="notice">{w.noDirectory}</div>}
    {!noList && data.unmatched.length > 0 && <div className="notice subtle">{w.unmatched(data.unmatched.length)}{me.role === 'admin' && <span className="muted"> · {data.unmatched.slice(0, 4).map(u => u.name || u.key).join('، ')}</span>}</div>}
    <Overview lang={lang} data={data} fetchedAt={fetchedAt} grid={grid} week={week} companyLevel />
  </div>;
}

export function Departments({ lang, range, onRange }: ScreenProps) {
  const w = t(lang); const [fn, setFn] = useState('');
  const { data, loading } = useData<Analytics>(`/api/admin/analytics?${qs(range)}`);
  if (!data) return <Loading />;
  const functions = [...new Set(data.departments.map(d => d.function).filter(Boolean))] as string[];
  const shown = data.departments.filter(d => d.name !== '—' && (!fn || d.function === fn));
  return <div className={`page${loading ? ' refreshing' : ''}`}>
    <TitleRow lang={lang} title={`${w.companyName} · ${w.departments}`} sub={`${shown.length} ${w.departments}`} people={data.people} actions={<RangePicker lang={lang} range={range} onChange={onRange} />} />
    <div className="pills wrap filter-row"><button className={!fn ? 'on' : ''} onClick={() => setFn('')}>{w.allFunctions}</button>{functions.map(f => <button key={f} className={fn === f ? 'on' : ''} onClick={() => setFn(f)}>{fnName(lang, data.functionNames, f)}</button>)}</div>
    <div className="dept-grid">{shown.map(d => <button key={d.name} className="card dept" onClick={() => go(deptHash(d.name))}>
      <header><span><b>{d.name}</b><small>{fnName(lang, data.functionNames, d.function)}</small></span><span className="live-chip"><i />{d.insideNow}/{d.people}</span></header>
      <div className="dept-main"><strong>{percent(d.attendanceRate)}</strong><small>{w.attendanceRate}</small></div>
      <div className="meter" aria-hidden="true"><i style={{ inlineSize: `${(d.attendanceRate ?? 0) * 100}%`, background: 'var(--sand)' }} /></div>
      <div className="dept-stats">
        <span><b>{percent(d.onTimeRate)}</b><small>{w.onTimeRate}</small></span>
        <span><b>{duration(lang, d.averageMinutes)}</b><small>{w.averageDay}</small></span>
        <span><b>{minuteClock(d.medianArrival)}</b><small>{w.medianArrival}</small></span>
      </div>
    </button>)}</div>
    {!shown.length && <p className="card muted">{w.noData}</p>}
  </div>;
}

export function Department({ lang, range, onRange, name }: ScreenProps & { name: string }) {
  const w = t(lang);
  const { data, fetchedAt, loading } = useData<Analytics>(`/api/admin/analytics?${qs(range, { department: name })}`);
  const { data: grid } = useData<Grid>(`/api/admin/contributions?${qs(range, { department: name })}`);
  const { data: week } = useData<Analytics>(`/api/admin/analytics?${qs(weekOf(range.to), { department: name })}`);
  if (!data) return <Loading />;
  const fn = data.people[0]?.member.function ?? null;
  return <div className={`page${loading ? ' refreshing' : ''}`}>
    <a className="crumb" href="#/departments">‹ {w.departments}</a>
    <TitleRow lang={lang} title={name} sub={`${fnName(lang, data.functionNames, fn)} · ${w.members(data.kpis.people)}`} people={data.people} actions={<RangePicker lang={lang} range={range} onChange={onRange} />} />
    <Overview lang={lang} data={data} fetchedAt={fetchedAt} grid={grid} week={week} companyLevel={false} />
  </div>;
}

export function Employees({ lang, range, onRange, me, onImport }: ScreenProps & { me: Me; onImport: () => void }) {
  const w = t(lang); const [q, setQ] = useState(''); const [dept, setDept] = useState('');
  const { data, loading } = useData<Analytics>(`/api/admin/analytics?${qs(range)}`);
  if (!data) return <Loading />;
  const departments = [...new Set(data.people.map(p => p.member.department).filter(Boolean))].sort() as string[];
  const shown = data.people.filter(p => (!dept || p.member.department === dept) && (!q || `${p.member.name} ${p.member.nameAr ?? ''} ${p.member.email ?? ''} ${p.member.employeeId ?? ''} ${p.member.titleEn ?? ''}`.toLowerCase().includes(q.toLowerCase())));
  return <div className={`page${loading ? ' refreshing' : ''}`}>
    <TitleRow lang={lang} title={`${w.companyName} · ${w.employees}`} sub={w.members(shown.length)} people={shown}
      actions={<><RangePicker lang={lang} range={range} onChange={onRange} />{me.role === 'admin' && <button className="pill-btn light" onClick={onImport}><span aria-hidden="true">＋</span>{w.upload}</button>}</>} />
    <section className="card">
      <div className="filters"><input value={q} onChange={e => setQ(e.target.value)} placeholder={w.search} aria-label={w.search} />
        <select value={dept} onChange={e => setDept(e.target.value)} aria-label={w.department}><option value="">{w.allDepartments}</option>{departments.map(d => <option key={d}>{d}</option>)}</select></div>
      <MembersTable lang={lang} people={shown} />
    </section>
  </div>;
}

export function Employee({ lang, range, onRange, id }: ScreenProps & { id: string }) {
  const w = t(lang);
  const { data, fetchedAt, loading } = useData<Analytics>(`/api/admin/analytics?${qs(range, { person: id })}`);
  const { data: grid } = useData<Grid>(`/api/admin/contributions?${qs(range, { person: id })}`);
  const week = weekOf(range.to);
  const { data: weekData } = useData<Analytics>(`/api/admin/analytics?${qs(week, { person: id })}`);
  const dept = data?.people[0]?.member.department ?? null;
  const { data: peers } = useData<Analytics>(dept ? `/api/admin/analytics?${qs(range, { department: dept })}` : null);
  if (!data) return <Loading />;
  const me = data.people[0];
  if (!me) return <div className="page"><a className="crumb" href="#/employees">‹ {w.employees}</a><p className="card">{w.notFound}</p></div>;
  const days = me.days ?? [], m = me.member;
  const today = days.find(d => d.date === data.range.today);
  const taps = days.flatMap(d => d.taps.map(tap => ({ ...tap, date: d.date }))).slice(-8).reverse();
  const ranked = peers ? [...peers.people].filter(p => p.present >= 3).sort((a, b) => (b.onTimeRate ?? 0) - (a.onTimeRate ?? 0)) : [];
  const rank = ranked.findIndex(p => p.member.key === m.key);
  const expected = me.expected || 1;
  const weekDays = Array.from({ length: 7 }, (_, i) => shift(week.from, i));
  // Today's total first, then each stretch inside the building (latest first), like the concept's task list.
  const stretches: LiveRow[] = [];
  if (today) { let open: number | null = null; for (const tap of today.taps) { if (tap.direction === 'in') { if (open === null) open = tap.at; } else if (open !== null) { stretches.push({ key: `${open}`, name: `${clock(lang, open)} – ${clock(lang, tap.at)}`, sub: w.session, minutesAtFetch: Math.round((tap.at - open) / 60_000), inside: false }); open = null; } }
    if (open !== null && today.inside) stretches.push({ key: `${open}`, name: `${clock(lang, open)} – …`, sub: w.inside, minutesAtFetch: Math.round((fetchedAt - open) / 60_000), inside: true }); }
  const sessions: LiveRow[] = today?.taps.length ? [{ key: m.key, name: nameOf(lang, m), sub: '', minutesAtFetch: me.today.minutes, inside: me.today.inside }, ...stretches.reverse()] : [];
  return <div className={`page${loading ? ' refreshing' : ''}`}>
    <a className="crumb" href="#/employees">‹ {w.employees}</a>
    <TitleRow lang={lang} title={m.department ?? w.employees} sub={peers ? w.members(peers.kpis.people) : ''} people={peers?.people ?? []} active={m.key} actions={<RangePicker lang={lang} range={range} onChange={onRange} />} />
    <div className="grid">
      <section className="card portrait span-3 row-2">
        <div className="portrait-art"><span className="avatar xl">{initials(m.name)}</span>{today?.inside && <span className="live-tag"><i />{w.inside} · {w.since} {clock(lang, today.firstIn)}</span>}</div>
        <div className="portrait-chip"><div><b>{nameOf(lang, m)}</b><small>{titleOf(lang, m)}</small></div>
          <div className="chip-actions">{m.department && <a className="round" href={deptHash(m.department)} aria-label={w.department} title={m.department}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm0 2c-2.3 0-7 1.2-7 3.5V19h14v-2.5C15 14.2 10.3 13 8 13Zm8 0c-.3 0-.6 0-1 .1a4.2 4.2 0 0 1 2 3.4V19h6v-2.5c0-2.3-4.7-3.5-7-3.5Z" /></svg></a>}
            {m.email && <a className="round light" href={`mailto:${m.email}`} aria-label={w.email} title={m.email}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18v14H3Zm2 2v.5l7 4.5 7-4.5V7Zm14 10V9.8l-7 4.5-7-4.5V17Z" /></svg></a>}</div></div>
      </section>
      <section className="card span-3 accent-card"><LiveTimer lang={lang} title={w.insideToday} rows={sessions} fetchedAt={fetchedAt} emptyLabel={w.notIn} />
        <p className="foot">{m.employeeId ?? ''}{m.officeNumber ? ` · ${w.office} ${m.officeNumber}` : ''}</p></section>
      <Card title={w.attendanceMix} className="span-3"><Rings center={percent(me.attendanceRate)} centerLabel={`${me.present} ${w.daysPresent}`} parts={[{ label: w.onTime, value: me.green / expected, color: STATUS.good }, { label: w.late, value: me.yellow / expected, color: STATUS.warning }, { label: w.absent, value: me.red / expected, color: STATUS.critical }]} /></Card>
      <div className="stack span-3 row-2">
        <Card title={w.weeklyActivity} extra={<span className="pill">{w.medianArrival} {minuteClock(me.medianArrival)}</span>} className="grow"><WorkActivity lang={lang} matrix={data.weekHours} /></Card>
        <Card title={w.recentTaps}><ol className="taps">{taps.map(tap => <li key={tap.at} className={tap.direction}><b>{tap.direction === 'in' ? w.in : w.out}</b><span>{shortDate(lang, tap.date)}</span><strong>{clock(lang, tap.at)}</strong></li>)}{!taps.length && <li className="muted">{w.noData}</li>}</ol></Card>
      </div>
      <div className="tiles span-6 four">
        <Tile value={String(me.streak)} label={w.streak} tone="good" hint={`${w.bestStreak} ${me.bestStreak}`} />
        <Tile value={percent(me.onTimeRate)} label={w.onTimeRate} hint={rank >= 0 ? `${w.rank} ${rank + 1}/${ranked.length} ${w.inDepartment}` : undefined} />
        <Tile value={duration(lang, me.averageMinutes)} label={w.averageDay} hint={`${w.medianArrival} ${minuteClock(me.medianArrival)}`} />
        <Tile value={duration(lang, me.averageOutside)} label={w.averageOutside} tone="outside" hint={`${me.averageBreaks} ${w.breaks} ${w.perDay} · ${duration(lang, me.lateMinutes)} ${w.lateMinutes}`} />
      </div>
      <Card title={w.weekOverview} extra={<span className="pill">{shortDate(lang, week.from)} – {shortDate(lang, week.to)}</span>} className="span-12"><WeekBoard lang={lang} days={weekDays} today={data.range.today} cards={sessionCards(lang, weekData?.people[0]?.days ?? [], week)} /></Card>
      <Card title={w.dailyHours} extra={<span className="pill">{w.required} {duration(lang, data.rules.requiredMinutes)}</span>} className="span-8 chart-card"><DailyHours lang={lang} days={days} required={data.rules.requiredMinutes} /></Card>
      <Card title={w.arrivals} className="span-4 chart-card"><ArrivalDots lang={lang} days={days} start={data.rules.workStartMinutes} grace={data.rules.lateGraceMinutes} /></Card>
      <Card title={w.yearActivity} className="span-12">{grid ? <YearGrid lang={lang} days={grid.days} perPerson /> : <Loading />}</Card>
      <Card title={w.timeline} className="span-8"><DayTimeline lang={lang} days={days} /></Card>
      <Card title={w.doors} className="span-4"><DoorList lang={lang} doors={data.doors.slice(0, 5)} /></Card>
      <p className="foot span-12">{rulesText(lang, data.rules)} {longDate(lang, data.range.today)}</p>
    </div>
  </div>;
}

/* ---------- system health (Settings) ---------- */
export type HealthLevel = 'ok' | 'warn' | 'fail' | 'off';
type HealthCheck = { id: string; group: 'jisr' | 'unifi' | 'system' | 'data'; level: HealthLevel; code: string; params?: Record<string, any> };
export type HealthReport = { level: HealthLevel; checkedAt: number; liveCheckedAt: number; checks: HealthCheck[] };
const LEVEL_ICON: Record<HealthLevel, string> = { ok: '✓', warn: '!', fail: '✕', off: '–' };
const span = (lang: Lang, ms: number) => {
  const s = Math.max(0, ms / 1000), [value, unit] = s < 90 ? [Math.round(s), 'second'] : s < 5400 ? [Math.round(s / 60), 'minute'] : s < 129600 ? [Math.round(s / 3600), 'hour'] : [Math.round(s / 86400), 'day'];
  return new Intl.NumberFormat(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { style: 'unit', unit, unitDisplay: 'long' }).format(value);
};
// Isolated left-to-right so "0.2 MB" keeps its order inside Arabic text.
const megabytes = (bytes: number) => `⁦${(bytes / 1_048_576).toLocaleString('en', { maximumFractionDigits: 1 })} MB⁩`;
function healthText(lang: Lang, check: HealthCheck, now: number) {
  const h = t(lang).health, p = { ...(check.params ?? {}) };
  if (typeof p.at === 'number') { p.agoBare = span(lang, now - p.at); p.ago = now - p.at < 15_000 ? h.justNow : h.ago(p.agoBare); } else { p.ago = h.never; p.agoBare = h.never; }
  if (Array.isArray(p.names)) p.names = p.names.join(lang === 'ar' ? '، ' : ', ');
  if (typeof p.size === 'number') p.size = megabytes(p.size);
  if (typeof p.memory === 'number') p.memory = megabytes(p.memory);
  if (typeof p.uptime === 'number') p.uptime = span(lang, p.uptime * 1000);
  return (h.messages[check.code] ?? (() => check.code))(p);
}
export function HealthPanel({ lang }: { lang: Lang }) {
  const w = t(lang), h = w.health;
  const [report, setReport] = useState<HealthReport | null>(null); const [busy, setBusy] = useState(false); const [now, setNow] = useState(Date.now());
  const load = async (refresh = false) => { setBusy(true); try { setReport(await get<HealthReport>(`/api/admin/health${refresh ? '?refresh=1' : ''}`)); } catch { /* keep the last report */ } finally { setBusy(false); setNow(Date.now()); } };
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 60_000); const tick = setInterval(() => setNow(Date.now()), 15_000); return () => { clearInterval(timer); clearInterval(tick); }; }, []);
  if (!report) return <section className="card span-12 health"><Loading /></section>;
  const tally = (['fail', 'warn', 'ok', 'off'] as const).map(l => [l, report.checks.filter(c => c.level === l).length] as const).filter(([, n]) => n);
  const groups = (['jisr', 'unifi', 'system', 'data'] as const).map(g => [g, report.checks.filter(c => c.group === g)] as const);
  return <section className="card span-12 health" aria-busy={busy}>
    <header className="card-head">
      <h3>{h.title}</h3>
      <div className="health-meta">
        <span className={`health-pill ${report.level}`} role="status"><i aria-hidden="true">{LEVEL_ICON[report.level]}</i>{h.overall[report.level]}</span>
        <span className="muted">{h.checked(now - report.liveCheckedAt < 15_000 ? h.justNow : h.ago(span(lang, now - report.liveCheckedAt)))}</span>
        <button type="button" className="pill-btn" onClick={() => void load(true)} disabled={busy}>{busy ? h.checking : h.refresh}</button>
      </div>
    </header>
    <div className="health-bar" role="img" aria-label={tally.map(([l, n]) => `${n} ${h.level[l]}`).join(', ')}>
      {report.checks.map(c => <span key={c.id} className={c.level} title={`${h.titles[c.id] ?? c.id}: ${h.level[c.level]}`} />)}
    </div>
    <div className="health-tally">{tally.map(([l, n]) => <span key={l} className={l}><i aria-hidden="true">{LEVEL_ICON[l]}</i>{n} {h.level[l]}</span>)}</div>
    <div className="health-groups">
      {groups.map(([g, checks]) => <div key={g} className="health-group">
        <h4>{h.groups[g]}</h4>
        <ul>{checks.map(c => <li key={c.id} className={c.level}>
          <i aria-label={h.level[c.level]}>{LEVEL_ICON[c.level]}</i>
          <div><b>{h.titles[c.id] ?? c.id}</b><span>{healthText(lang, c, now)}</span></div>
        </li>)}</ul>
      </div>)}
    </div>
  </section>;
}

/* ---------- settings: holidays, company-wide or per department ---------- */
type Holiday = { id: string; name: string; from: string; to: string; departments: string[] };
function Holidays({ lang }: { lang: Lang }) {
  const w = t(lang), h = w.holidays;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
  const [list, setList] = useState<Holiday[] | null>(null); const [departments, setDepartments] = useState<string[]>([]);
  const [draft, setDraft] = useState({ name: '', from: today, to: today, company: true, departments: [] as string[] });
  const [status, setStatus] = useState<{ kind: 'idle' | 'saving' | 'ok' | 'error'; text?: string }>({ kind: 'idle' });
  useEffect(() => { void get<{ holidays: Holiday[]; departments: string[] }>('/api/admin/settings/holidays').then(r => { setList(r.holidays); setDepartments(r.departments); }).catch(() => setStatus({ kind: 'error', text: w.noData })); }, []);
  if (!list) return <section className="card span-12"><Loading /></section>;
  const store = async (next: Omit<Holiday, 'id'>[] | Holiday[], done: string) => {
    setStatus({ kind: 'saving' });
    const r = await fetch('/api/admin/settings/holidays', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ holidays: next }) });
    const body = await r.json().catch(() => ({}));
    if (r.ok) { setList(body.holidays); setStatus({ kind: 'ok', text: done }); return true; }
    setStatus({ kind: 'error', text: body.error || 'Error' }); return false;
  };
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.company && !draft.departments.length) { setStatus({ kind: 'error', text: h.pickDepartment }); return; }
    const to = draft.to < draft.from ? draft.from : draft.to;
    if (await store([...list, { name: draft.name, from: draft.from, to, departments: draft.company ? [] : draft.departments }], h.added)) setDraft({ ...draft, name: '' });
  };
  const fmt = (d: string) => new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(Date.parse(`${d}T12:00:00Z`));
  const length = (x: Holiday) => Math.round((Date.parse(x.to) - Date.parse(x.from)) / 86_400_000) + 1;
  const toggle = (d: string) => setDraft({ ...draft, company: false, departments: draft.departments.includes(d) ? draft.departments.filter(x => x !== d) : [...draft.departments, d] });
  const upcoming = list.filter(x => x.to >= today), past = list.filter(x => x.to < today).reverse();
  const row = (x: Holiday) => <li key={x.id} className={x.to < today ? 'past' : ''}>
    <div><b>{x.name}</b><small>{fmt(x.from)}{x.to !== x.from && <> – {fmt(x.to)}</>} · {h.days(length(x))}</small></div>
    <div className="holiday-scope">{x.departments.length ? x.departments.map(d => <span key={d} className="chip">{d}</span>) : <span className="chip company">{h.company}</span>}</div>
    <button type="button" className="round" aria-label={`${h.remove} ${x.name}`} title={h.remove} disabled={status.kind === 'saving'} onClick={() => void store(list.filter(y => y.id !== x.id), h.removed)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-1 12H7L6 9Zm4 2v8h2v-8h-2Zm4 0v8h2v-8h-2Z" /></svg></button>
  </li>;
  return <section className="card span-12 holidays">
    <header className="card-head"><h3>{h.title}</h3></header>
    <p className="muted help">{h.help}</p>
    <div className="holidays-body">
      <form onSubmit={add} className="holiday-form">
        <div className="fields">
          <label><span>{h.name}</span><input required maxLength={80} value={draft.name} placeholder={h.namePlaceholder} onChange={e => { setDraft({ ...draft, name: e.target.value }); setStatus({ kind: 'idle' }); }} /></label>
          <label><span>{h.from}</span><input type="date" required value={draft.from} onChange={e => e.target.value && setDraft({ ...draft, from: e.target.value, to: draft.to < e.target.value ? e.target.value : draft.to })} /></label>
          <label><span>{h.to}</span><input type="date" required min={draft.from} value={draft.to} onChange={e => e.target.value && setDraft({ ...draft, to: e.target.value })} /></label>
        </div>
        <fieldset className="weekend"><legend>{h.appliesTo}</legend>
          <div className="pills wrap">
            <button type="button" className={draft.company ? 'on' : ''} aria-pressed={draft.company} onClick={() => setDraft({ ...draft, company: true, departments: [] })}>{h.company}</button>
            {departments.map(d => { const on = !draft.company && draft.departments.includes(d); return <button type="button" key={d} className={on ? 'on' : ''} aria-pressed={on} onClick={() => toggle(d)}>{d}</button>; })}
          </div>
          {!departments.length && <small className="muted">{h.noDepartments}</small>}
        </fieldset>
        <div className="form-actions"><button className="pill-btn light" disabled={status.kind === 'saving'}>{status.kind === 'saving' ? w.saving : h.add}</button>
          {status.text && <span className={status.kind === 'error' ? 'error' : 'ok'} role="status">{status.text}</span>}</div>
      </form>
      <div className="holiday-lists">
        {!list.length && <p className="muted">{h.none}</p>}
        {upcoming.length > 0 && <><h4>{h.upcoming}</h4><ul className="holiday-list">{upcoming.map(row)}</ul></>}
        {past.length > 0 && <><h4>{h.past}</h4><ul className="holiday-list">{past.map(row)}</ul></>}
      </div>
    </div>
  </section>;
}

/* ---------- settings: work rules (HR and admins) ---------- */
export function Settings({ lang }: { lang: Lang }) {
  const w = t(lang);
  const [rules, setRules] = useState<Rules | null>(null); const [status, setStatus] = useState<{ kind: 'idle' | 'saving' | 'ok' | 'error'; text?: string }>({ kind: 'idle' });
  useEffect(() => { void get<Rules>('/api/admin/settings/rules').then(setRules).catch(() => setStatus({ kind: 'error', text: w.noData })); }, []);
  if (!rules) return <Loading />;
  const hhmmToMinutes = (v: string) => { const [h, m] = v.split(':').map(Number); return h * 60 + m; };
  const update = (patch: Partial<Rules>) => { setRules({ ...rules, ...patch }); setStatus({ kind: 'idle' }); };
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setStatus({ kind: 'saving' });
    const r = await fetch('/api/admin/settings/rules', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rules) });
    const body = await r.json().catch(() => ({}));
    if (r.ok) { setRules(body.rules); setStatus({ kind: 'ok', text: w.saved }); } else setStatus({ kind: 'error', text: body.error || 'Error' });
  };
  const lateFrom = rules.workStartMinutes + rules.lateGraceMinutes;
  return <div className="page">
    <div className="title-row"><div className="title"><h1>{w.settings}</h1><span>{w.health.title} · {w.workRules} · {w.holidays.title}</span></div><span /><span /></div>
    <div className="grid">
      <HealthPanel lang={lang} />
      <form className="card span-8 settings" onSubmit={save}>
        <header className="card-head"><h3>{w.workRules}</h3></header>
        <p className="muted help">{w.rulesHelp}</p>
        <div className="fields">
          <label><span>{w.workStart}</span><input type="time" required value={minuteClock(rules.workStartMinutes)} onChange={e => e.target.value && update({ workStartMinutes: hhmmToMinutes(e.target.value) })} /></label>
          <label><span>{w.grace}</span><div className="unit"><input type="number" min={0} max={240} step={1} required value={rules.lateGraceMinutes} onChange={e => update({ lateGraceMinutes: Number(e.target.value) })} /><em>{w.minutesUnit}</em></div></label>
          <label><span>{w.requiredTime}</span><div className="unit"><input type="number" min={1} max={16} step={0.25} required value={rules.requiredMinutes / 60} onChange={e => update({ requiredMinutes: Math.round(Number(e.target.value) * 60) })} /><em>{w.hoursUnit}</em></div></label>
        </div>
        <fieldset className="weekend"><legend>{w.weekendDays}</legend>
          <div className="pills wrap">{Array.from({ length: 7 }, (_, d) => { const on = rules.weekendDays.includes(d); return <button type="button" key={d} className={on ? 'on' : ''} aria-pressed={on} onClick={() => update({ weekendDays: on ? rules.weekendDays.filter(x => x !== d) : [...rules.weekendDays, d].sort() })}>{new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', { weekday: 'long', timeZone: 'UTC' }).format(Date.UTC(2026, 9, 25 + d))}</button>; })}</div>
        </fieldset>
        <div className="form-actions"><button className="pill-btn light" disabled={status.kind === 'saving'}>{status.kind === 'saving' ? w.saving : w.save}</button>
          {status.text && <span className={status.kind === 'error' ? 'error' : 'ok'} role="status">{status.text}</span>}</div>
      </form>
      <section className="card span-4 accent-card">
        <header className="card-head"><h3>{w.preview}</h3></header>
        <div className="live-hero static"><span><small>{w.lateAfter('')}</small><strong>{minuteClock(lateFrom)}</strong></span></div>
        <p className="foot">{rulesText(lang, rules)}</p>
      </section>
      <Holidays lang={lang} />
    </div>
  </div>;
}
