import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrivalDots, DailyAttendance, DailyHours, DayTimeline, DoorList, RankBars, Ring, STATUS, OUTSIDE, TimeHistogram, WeekHours, YearGrid, type DailyPoint, type Day, type RankItem } from './charts';
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
export type Preset = '7' | '30' | '90' | 'month' | 'year' | 'custom';
export type Range = { preset: Preset; from: string; to: string };
const riyadhToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
const minus = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
export const presetRange = (preset: Preset, custom?: { from: string; to: string }): Range => {
  const today = riyadhToday();
  if (preset === 'custom' && custom) return { preset, ...custom };
  if (preset === 'month') return { preset, from: `${today.slice(0, 8)}01`, to: today };
  if (preset === 'year') return { preset, from: `${today.slice(0, 4)}-01-01`, to: today };
  return { preset, from: minus(today, Number(preset === 'custom' ? '30' : preset) - 1), to: today };
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

/* ---------- helpers ---------- */
const get = async <T,>(url: string): Promise<T> => { const r = await fetch(url); if (!r.ok) throw new Error(String(r.status)); return r.json(); };
function useData<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null); const [loading, setLoading] = useState(false);
  useEffect(() => { if (!url) return; let live = true; const load = () => { setLoading(true); get<T>(url).then(d => { if (live) setData(d); }).catch(() => {}).finally(() => { if (live) setLoading(false); }); }; load(); const timer = setInterval(load, 60_000); return () => { live = false; clearInterval(timer); }; }, [url]);
  return { data, loading };
}
export const initials = (name: string | null) => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
export const go = (hash: string) => { location.hash = hash; };
const personHash = (m: Member) => `#/employee/${encodeURIComponent(m.employeeId ?? m.key)}`;
const deptHash = (name: string) => `#/department/${encodeURIComponent(name)}`;
const nameOf = (lang: Lang, m: Member) => (lang === 'ar' && m.nameAr) || m.name;
const titleOf = (lang: Lang, m: Member) => (lang === 'ar' && m.titleAr) || m.titleEn || '';
const fnName = (lang: Lang, names: Record<string, string> | undefined, fn: string | null) => !fn ? '' : (lang === 'ar' && names?.[fn]) || fn;
const qs = (range: Range, extra: Record<string, string> = {}) => new URLSearchParams({ from: range.from, to: range.to, ...extra }).toString();
const Card = ({ title, extra, className = '', children }: { title?: string; extra?: React.ReactNode; className?: string; children: React.ReactNode }) =>
  <section className={`card ${className}`}>{(title || extra) && <header className="card-head"><h3>{title}</h3>{extra}</header>}{children}</section>;
const Kpi = ({ value, label, tone, hint }: { value: string; label: string; tone?: 'good' | 'warning' | 'critical' | 'outside'; hint?: string }) =>
  <section className="card kpi"><strong>{value}</strong><span>{tone && <i style={{ background: tone === 'outside' ? OUTSIDE : STATUS[tone] }} />}{label}</span>{hint && <small>{hint}</small>}</section>;
const rulesText = (lang: Lang, r?: Rules) => r ? t(lang).rules(minuteClock(r.workStartMinutes), r.lateGraceMinutes, duration(lang, r.requiredMinutes)) : '';
const Loading = () => <div className="loading" aria-busy="true">…</div>;
function Pills<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return <div className="pills" role="tablist">{options.map(([v, l]) => <button key={v} role="tab" aria-selected={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>)}</div>;
}

export function PeopleStrip({ lang, title, sub, people, active }: { lang: Lang; title: string; sub: string; people: Stats[]; active?: string }) {
  const row = useRef<HTMLDivElement>(null);
  const sorted = useMemo(() => [...people].sort((a, b) => Number(b.today.inside) - Number(a.today.inside)), [people]);
  const scroll = (d: number) => row.current?.scrollBy({ left: d * (lang === 'ar' ? -1 : 1) * 320, behavior: 'smooth' });
  return <div className="strip-wrap">
    <div className="team-title"><h2>{title}</h2><span>{sub}</span></div>
    <div className="people-strip"><button className="nav" aria-label="‹" onClick={() => scroll(-1)}>‹</button>
      <div className="strip-row" ref={row}>{sorted.map(p => <button key={p.member.key} className={`face${active === p.member.key ? ' active' : ''}`} title={nameOf(lang, p.member)} onClick={() => go(personHash(p.member))}><span className="avatar">{initials(p.member.name)}</span>{p.today.inside && <i className="live-dot" />}</button>)}</div>
      <button className="nav" aria-label="›" onClick={() => scroll(1)}>›</button></div>
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

/* ---------- overview used by company and department ---------- */
function Overview({ lang, data, grid, title, sub, companyLevel }: { lang: Lang; data: Analytics; grid: Grid | null; title: string; sub: string; companyLevel: boolean }) {
  const w = t(lang), k = data.kpis;
  return <>
    <PeopleStrip lang={lang} title={title} sub={sub} people={data.people} />
    <div className="grid">
      <section className="card hero span-4">
        <div><span className="eyebrow">{w.insideNow}</span><strong className="big">{k.insideNow}<small> {w.of} {k.people}</small></strong><p>{k.leftToday} {w.left} · {data.range.since ? w.recordingSince(longDate(lang, data.range.since)) : ''}</p></div>
        <Ring value={k.insideNow} total={k.people} />
      </section>
      <div className="kpis span-8">
        <Kpi value={percent(k.attendanceRate)} label={w.attendanceRate} />
        <Kpi value={percent(k.onTimeRate)} label={w.onTimeRate} tone="good" />
        <Kpi value={duration(lang, k.averageMinutes)} label={w.averageDay} hint={`${w.medianArrival} ${minuteClock(k.medianArrival)}`} />
        <Kpi value={duration(lang, k.averageOutside)} label={w.averageOutside} tone="outside" hint={`${k.averageBreaks} ${w.breaks} ${w.perDay}`} />
        <Kpi value={String(k.lateDays)} label={w.lateDays} tone="warning" />
        <Kpi value={String(k.absentDays)} label={w.absentDays} tone="critical" />
      </div>
      <Card title={w.dailyAttendance} className="span-8"><DailyAttendance lang={lang} data={data.daily} /></Card>
      <Card title={w.leaders} className="span-4"><Leaderboard lang={lang} people={data.people} /></Card>
      {companyLevel
        ? <Card title={w.byDepartment} className="span-8"><GroupCompare lang={lang} groups={data.departments} names={data.functionNames} link={g => deptHash(g.name)} /></Card>
        : <Card title={w.people} className="span-8"><MembersTable lang={lang} people={data.people} /></Card>}
      <Card title={w.weeklyActivity} className="span-4"><WeekHours lang={lang} matrix={data.weekHours} fromHour={7} toHour={20} /></Card>
      <Card title={w.yearActivity} className="span-12">{grid ? <YearGrid lang={lang} days={grid.days} /> : <Loading />}</Card>
      <Card title={w.arrivals} extra={<span className="pill">{w.medianArrival} {minuteClock(k.medianArrival)}</span>} className="span-4"><TimeHistogram lang={lang} bins={data.arrivals} title={w.arrivals} marker={data.rules.workStartMinutes + data.rules.lateGraceMinutes} /></Card>
      <Card title={w.departures} extra={<span className="pill">{w.medianDeparture} {minuteClock(k.medianDeparture)}</span>} className="span-4"><TimeHistogram lang={lang} bins={data.departures} title={w.departures} /></Card>
      {companyLevel
        ? <Card title={w.byFunction} className="span-4"><GroupCompare lang={lang} groups={data.functions} names={data.functionNames} /></Card>
        : <Card title={w.doors} className="span-4"><DoorList lang={lang} doors={data.doors} /></Card>}
    </div>
    <p className="foot">{rulesText(lang, data.rules)}</p>
  </>;
}

/* ---------- screens ---------- */
export function Company({ lang, range, me, onImport }: { lang: Lang; range: Range; me: Me; onImport: () => void }) {
  const w = t(lang);
  const { data, loading } = useData<Analytics>(`/api/admin/analytics?${qs(range)}`);
  const { data: grid } = useData<Grid>(`/api/admin/contributions?${qs(range)}`);
  if (!data) return <Loading />;
  const noList = data.people.every(p => !p.member.inDirectory);
  return <div className={`page${loading ? ' refreshing' : ''}`}>
    {noList && <div className="notice">{w.noDirectory}{me.role === 'admin' && <button className="btn primary" onClick={onImport}>{w.importList}</button>}</div>}
    {!noList && data.unmatched.length > 0 && <div className="notice subtle">{w.unmatched(data.unmatched.length)}{me.role === 'admin' && <span className="muted"> · {data.unmatched.slice(0, 4).map(u => u.name || u.key).join('، ')}</span>}</div>}
    <Overview lang={lang} data={data} grid={grid} title={w.companyName} sub={w.members(data.kpis.people)} companyLevel />
  </div>;
}

export function Departments({ lang, range }: { lang: Lang; range: Range }) {
  const w = t(lang); const [fn, setFn] = useState('');
  const { data, loading } = useData<Analytics>(`/api/admin/analytics?${qs(range)}`);
  if (!data) return <Loading />;
  const functions = [...new Set(data.departments.map(d => d.function).filter(Boolean))] as string[];
  const shown = data.departments.filter(d => d.name !== '—' && (!fn || d.function === fn));
  return <div className={`page${loading ? ' refreshing' : ''}`}>
    <div className="page-head"><div className="team-title"><h2>{w.departments}</h2><span>{shown.length}</span></div>
      <div className="pills wrap"><button className={!fn ? 'on' : ''} onClick={() => setFn('')}>{w.allFunctions}</button>{functions.map(f => <button key={f} className={fn === f ? 'on' : ''} onClick={() => setFn(f)}>{fnName(lang, data.functionNames, f)}</button>)}</div></div>
    <div className="dept-grid">{shown.map(d => <button key={d.name} className="card dept" onClick={() => go(deptHash(d.name))}>
      <header><span><b>{d.name}</b><small>{fnName(lang, data.functionNames, d.function)}</small></span><span className="live">{d.insideNow}/{d.people}</span></header>
      <div className="dept-stats">
        <span><strong>{percent(d.attendanceRate)}</strong><small>{w.attendanceRate}</small></span>
        <span><strong>{percent(d.onTimeRate)}</strong><small>{w.onTimeRate}</small></span>
        <span><strong>{duration(lang, d.averageMinutes)}</strong><small>{w.averageDay}</small></span>
      </div>
      <div className="meter" aria-hidden="true"><i style={{ inlineSize: `${(d.onTimeRate ?? 0) * 100}%`, background: STATUS.good }} /></div>
      <footer><span>{w.medianArrival} {minuteClock(d.medianArrival)}</span><span>{w.averageOutside} {duration(lang, d.averageOutside)}</span></footer>
    </button>)}</div>
    {!shown.length && <p className="card muted">{w.noData}</p>}
  </div>;
}

export function Department({ lang, range, name }: { lang: Lang; range: Range; name: string }) {
  const w = t(lang);
  const { data, loading } = useData<Analytics>(`/api/admin/analytics?${qs(range, { department: name })}`);
  const { data: grid } = useData<Grid>(`/api/admin/contributions?${qs(range, { department: name })}`);
  if (!data) return <Loading />;
  const fn = data.people[0]?.member.function ?? null;
  return <div className={`page${loading ? ' refreshing' : ''}`}>
    <a className="crumb" href="#/departments">‹ {w.departments}</a>
    <Overview lang={lang} data={data} grid={grid} title={name} sub={`${fnName(lang, data.functionNames, fn)} · ${w.members(data.kpis.people)}`} companyLevel={false} />
  </div>;
}

export function Employees({ lang, range, me, onImport }: { lang: Lang; range: Range; me: Me; onImport: () => void }) {
  const w = t(lang); const [q, setQ] = useState(''); const [dept, setDept] = useState('');
  const { data, loading } = useData<Analytics>(`/api/admin/analytics?${qs(range)}`);
  if (!data) return <Loading />;
  const departments = [...new Set(data.people.map(p => p.member.department).filter(Boolean))].sort() as string[];
  const shown = data.people.filter(p => (!dept || p.member.department === dept) && (!q || `${p.member.name} ${p.member.nameAr ?? ''} ${p.member.email ?? ''} ${p.member.employeeId ?? ''} ${p.member.titleEn ?? ''}`.toLowerCase().includes(q.toLowerCase())));
  return <div className={`page${loading ? ' refreshing' : ''}`}>
    <div className="page-head"><div className="team-title"><h2>{w.employees}</h2><span>{w.members(shown.length)}</span></div>
      {me.role === 'admin' && <button className="btn" onClick={onImport}>{w.importList}</button>}</div>
    <section className="card">
      <div className="filters"><input value={q} onChange={e => setQ(e.target.value)} placeholder={w.search} aria-label={w.search} />
        <select value={dept} onChange={e => setDept(e.target.value)} aria-label={w.department}><option value="">{w.allDepartments}</option>{departments.map(d => <option key={d}>{d}</option>)}</select></div>
      <MembersTable lang={lang} people={shown} />
    </section>
  </div>;
}

export function Employee({ lang, range, id }: { lang: Lang; range: Range; id: string }) {
  const w = t(lang);
  const { data, loading } = useData<Analytics>(`/api/admin/analytics?${qs(range, { person: id })}`);
  const { data: grid } = useData<Grid>(`/api/admin/contributions?${qs(range, { person: id })}`);
  const dept = data?.people[0]?.member.department ?? null;
  const { data: peers } = useData<Analytics>(dept ? `/api/admin/analytics?${qs(range, { department: dept })}` : null);
  if (!data) return <Loading />;
  const me = data.people[0];
  if (!me) return <div className="page"><a className="crumb" href="#/employees">‹ {w.employees}</a><p className="card">{w.notFound}</p></div>;
  const days = me.days ?? [], m = me.member;
  const today = days.find(d => d.date === data.range.today);
  const taps = days.flatMap(d => d.taps.map(tap => ({ ...tap, date: d.date }))).slice(-12).reverse();
  const ranked = peers ? [...peers.people].filter(p => p.present >= 3).sort((a, b) => (b.onTimeRate ?? 0) - (a.onTimeRate ?? 0)) : [];
  const rank = ranked.findIndex(p => p.member.key === m.key);
  return <div className={`page${loading ? ' refreshing' : ''}`}>
    <a className="crumb" href="#/employees">‹ {w.employees}</a>
    {peers && <PeopleStrip lang={lang} title={m.department ?? w.employees} sub={w.members(peers.kpis.people)} people={peers.people} active={m.key} />}
    <div className="grid">
      <section className="card profile span-4">
        <div className="profile-face"><span className="avatar xl">{initials(m.name)}</span>{today?.inside && <span className="live-tag"><i />{w.inside} · {w.since} {clock(lang, today.firstIn)}</span>}</div>
        <div className="profile-info"><div><h2>{nameOf(lang, m)}</h2><span>{titleOf(lang, m)}</span>
          <small>{m.department && <a href={deptHash(m.department)}>{m.department}</a>}{m.employeeId ? ` · ${m.employeeId}` : ''}{m.officeNumber ? ` · ${w.office} ${m.officeNumber}` : ''}</small></div>
          {m.email && <a className="icon-btn" href={`mailto:${m.email}`} aria-label={w.email}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18v14H3Zm2 2v.5l7 4.5 7-4.5V7Zm14 10V9.8l-7 4.5-7-4.5V17Z" /></svg></a>}</div>
      </section>
      <div className="kpis span-8">
        <Kpi value={percent(me.attendanceRate)} label={w.attendanceRate} hint={`${me.present} ${w.daysPresent}`} />
        <Kpi value={percent(me.onTimeRate)} label={w.onTimeRate} tone="good" hint={rank >= 0 ? `${w.rank} ${rank + 1}/${ranked.length} ${w.inDepartment}` : undefined} />
        <Kpi value={duration(lang, me.averageMinutes)} label={w.averageDay} hint={`${w.medianArrival} ${minuteClock(me.medianArrival)}`} />
        <Kpi value={duration(lang, me.averageOutside)} label={w.averageOutside} tone="outside" hint={`${me.averageBreaks} ${w.breaks} ${w.perDay}`} />
        <Kpi value={String(me.streak)} label={w.streak} tone="good" hint={`${w.bestStreak} ${me.bestStreak}`} />
        <Kpi value={duration(lang, me.lateMinutes)} label={w.lateMinutes} tone="warning" hint={`${me.yellow} ${w.lateDays} · ${me.red} ${w.absentDays}`} />
      </div>
      <Card title={w.dailyHours} extra={<span className="pill">{w.required} {duration(lang, data.rules.requiredMinutes)}</span>} className="span-8"><DailyHours lang={lang} days={days} required={data.rules.requiredMinutes} /></Card>
      <Card title={w.arrivals} extra={<span className="pill">{w.medianArrival} {minuteClock(me.medianArrival)}</span>} className="span-4"><ArrivalDots lang={lang} days={days} start={data.rules.workStartMinutes} grace={data.rules.lateGraceMinutes} /></Card>
      <Card title={w.yearActivity} className="span-12">{grid ? <YearGrid lang={lang} days={grid.days} perPerson /> : <Loading />}</Card>
      <Card title={w.timeline} className="span-8"><DayTimeline lang={lang} days={days} /></Card>
      <Card title={w.weeklyActivity} className="span-4"><WeekHours lang={lang} matrix={data.weekHours} fromHour={7} toHour={20} /></Card>
      <Card title={w.recentTaps} className="span-6"><ol className="taps">{taps.map(tap => <li key={tap.at} className={tap.direction}><b>{tap.direction === 'in' ? w.in : w.out}</b><span>{shortDate(lang, tap.date)}</span><strong>{clock(lang, tap.at)}</strong></li>)}{!taps.length && <li className="muted">{w.noData}</li>}</ol></Card>
      <Card title={w.doors} className="span-6"><DoorList lang={lang} doors={data.doors} /><p className="foot">{rulesText(lang, data.rules)}</p></Card>
    </div>
  </div>;
}
