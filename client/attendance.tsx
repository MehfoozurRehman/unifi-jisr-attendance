import React, { useEffect, useMemo, useState } from 'react';
import { clock, duration, hhmm, longDate, monthName, shortMonth, t, weekdayNames, type Lang } from './i18n';

type Status = 'green' | 'yellow' | 'red' | 'off' | 'future' | 'today' | 'untracked';
type Tap = { at: number; direction: 'in' | 'out' };
type Day = { date: string; weekday: number; workday: boolean; status: Status; firstIn: number | null; lastOut: number | null; minutes: number; late: boolean; short: boolean; missingOut: boolean; missingIn: boolean; inside: boolean; taps: Tap[] };
type Totals = { green: number; yellow: number; red: number; late: number; present: number; minutes: number; averageMinutes: number };
type Rules = { workStartMinutes: number; lateGraceMinutes: number; requiredMinutes: number; weekendDays: number[] };
export type Person = { key: string; name: string | null; email: string | null; userId: string | null; employeeCode: string | null; department: string | null; managerEmail: string | null };
type TeamRow = { person: Person; today: Day; totals: Totals; days: Status[] };

const nowYM = () => { const [y, m] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit' }).format(new Date()).split('-').map(Number); return { y, m }; };
const get = async <T,>(url: string): Promise<T> => { const response = await fetch(url); if (!response.ok) throw new Error(String(response.status)); return response.json(); };
const initials = (name: string | null) => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
const rulesLine = (lang: Lang, rules: Rules | null) => rules ? t(lang).rules(hhmm(rules.workStartMinutes), rules.lateGraceMinutes, duration(lang, rules.requiredMinutes)) : '';
const totalsOf = (days: Day[]): Totals => { const worked = days.filter(d => d.taps.length); const minutes = worked.reduce((s, d) => s + d.minutes, 0); return { green: days.filter(d => d.status === 'green').length, yellow: days.filter(d => d.status === 'yellow').length, red: days.filter(d => d.status === 'red').length, late: days.filter(d => d.late).length, present: worked.length, minutes, averageMinutes: worked.length ? Math.round(minutes / worked.length) : 0 }; };

function MonthStepper({ lang, year, month, onChange }: { lang: Lang; year: number; month: number; onChange: (y: number, m: number) => void }) {
  const w = t(lang), step = (d: number) => { const n = new Date(Date.UTC(year, month - 1 + d, 1)); onChange(n.getUTCFullYear(), n.getUTCMonth() + 1); };
  return <div className="stepper"><button aria-label={w.prev} onClick={() => step(-1)}>‹</button><strong>{monthName(lang, year, month)}</strong><button aria-label={w.next} onClick={() => step(1)}>›</button></div>;
}

export function PersonPicker({ lang, value, onPick }: { lang: Lang; value: Person | null; onPick: (p: Person) => void }) {
  const w = t(lang); const [q, setQ] = useState(''); const [list, setList] = useState<Person[]>([]); const [open, setOpen] = useState(false);
  useEffect(() => { const timer = setTimeout(() => void get<Person[]>(`/api/admin/people?q=${encodeURIComponent(q)}`).then(setList).catch(() => setList([])), 150); return () => clearTimeout(timer); }, [q]);
  return <div className="picker-field">
    <button className="person-chip" onClick={() => setOpen(!open)} aria-expanded={open}>
      <span className="avatar">{initials(value?.name ?? null)}</span>
      <span><b>{value?.name || w.choosePerson}</b><small>{value ? value.email || w.noEmail : w.searchPerson}</small></span>
    </button>
    {open && <div className="person-menu"><input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={w.searchPerson} />
      <div className="person-list">{list.map(p => <button key={p.key} onClick={() => { onPick(p); setOpen(false); }}><span className="avatar">{initials(p.name)}</span><span><b>{p.name}</b><small>{p.email || w.noEmail}</small></span></button>)}{!list.length && <p className="muted">{w.noPeople}</p>}</div></div>}
  </div>;
}

function Legend({ lang }: { lang: Lang }) {
  const w = t(lang);
  return <div className="legend">{([['green', w.legendGreen], ['yellow', w.legendYellow], ['red', w.legendRed], ['off', w.legendOff], ['today', w.legendToday], ['untracked', w.legendUntracked]] as const).map(([k, label]) => <span key={k}><i className={`dot ${k}`} />{label}</span>)}</div>;
}

function StatCards({ lang, totals }: { lang: Lang; totals: Totals }) {
  const w = t(lang);
  return <section className="z-stats">
    <article><strong>{totals.present}</strong><span>{w.present}</span></article>
    <article className="green"><strong>{totals.green}</strong><span>{w.onTime}</span></article>
    <article className="yellow"><strong>{totals.yellow}</strong><span>{w.lateShort}</span></article>
    <article className="red"><strong>{totals.red}</strong><span>{w.absent}</span></article>
    <article><strong>{duration(lang, totals.minutes)}</strong><span>{w.totalHours}</span></article>
    <article><strong>{duration(lang, totals.averageMinutes)}</strong><span>{w.averageDay}</span></article>
  </section>;
}

function Ring({ totals, label }: { totals: Totals; label: string }) {
  const all = Math.max(1, totals.green + totals.yellow + totals.red), r = 52, c = 2 * Math.PI * r;
  let offset = 0;
  const arcs = (['green', 'yellow', 'red'] as const).map(k => { const len = (totals[k] / all) * c; const arc = <circle key={k} className={`arc ${k}`} r={r} cx="64" cy="64" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} />; offset += len; return arc; });
  return <svg className="ring" viewBox="0 0 128 128" role="img" aria-label={`${totals.green}/${totals.yellow}/${totals.red}`}><circle className="track" r={r} cx="64" cy="64" />{arcs}<text x="64" y="62">{Math.round((totals.green / all) * 100)}%</text><text className="sub" x="64" y="82">{label}</text></svg>;
}

function DayDetail({ lang, day }: { lang: Lang; day: Day | null }) {
  const w = t(lang);
  if (!day) return <aside className="panel detail"><p className="muted">{w.pickDay}</p></aside>;
  return <aside className="panel detail">
    <div className={`detail-head ${day.status}`}><h3>{longDate(lang, day.date)}</h3>{day.inside && <span className="live">{w.insideNow}</span>}</div>
    <dl><div><dt>{w.firstIn}</dt><dd>{clock(lang, day.firstIn)}</dd></div><div><dt>{w.lastOut}</dt><dd>{day.inside ? w.insideNow : clock(lang, day.lastOut)}</dd></div><div><dt>{w.worked}</dt><dd>{duration(lang, day.minutes)}</dd></div></dl>
    <div className="flags">{day.late && <span className="flag yellow">{w.late}</span>}{day.short && <span className="flag yellow">{w.short}</span>}{day.missingOut && <span className="flag red">{w.missingOut}</span>}{day.missingIn && <span className="flag yellow">{w.missingIn}</span>}</div>
    <h4>{w.taps}</h4>
    {day.taps.length ? <ol className="taps">{day.taps.map(tap => <li key={tap.at} className={tap.direction}><b>{tap.direction === 'in' ? w.in : w.out}</b><span>{clock(lang, tap.at)}</span></li>)}</ol> : <p className="muted">{w.noTaps}</p>}
  </aside>;
}

export function MonthView({ lang, person, onPerson }: { lang: Lang; person: Person | null; onPerson: (p: Person) => void }) {
  const w = t(lang); const start = nowYM(); const [year, setYear] = useState(start.y); const [month, setMonth] = useState(start.m);
  const [days, setDays] = useState<Day[]>([]); const [rules, setRules] = useState<Rules | null>(null); const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => { if (!person) return; const load = () => void get<{ days: Day[]; rules: Rules }>(`/api/admin/attendance/month?person=${encodeURIComponent(person.key)}&year=${year}&month=${month}`).then(r => { setDays(r.days); setRules(r.rules); }).catch(() => setDays([])); load(); const timer = setInterval(load, 30_000); return () => clearInterval(timer); }, [person?.key, year, month]);
  const totals = useMemo(() => totalsOf(days), [days]);
  const lead = days.length ? days[0].weekday : 0, day = days.find(d => d.date === selected) ?? null;
  return <div className="view">
    <div className="view-head"><div><div className="eyebrow">{w.monthTitle}</div><PersonPicker lang={lang} value={person} onPick={onPerson} /></div><MonthStepper lang={lang} year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); setSelected(null); }} /></div>
    {!person ? <p className="panel muted">{w.choosePerson}</p> : <>
      <StatCards lang={lang} totals={totals} />
      <div className="month-grid">
        <section className="panel calendar">
          <div className="cal-head">{weekdayNames(lang).map(n => <span key={n}>{n}</span>)}</div>
          <div className="cal-body">{Array.from({ length: lead }, (_, i) => <span key={`pad${i}`} className="pad" />)}
            {days.map(d => <button key={d.date} className={`cell ${d.status}${selected === d.date ? ' selected' : ''}`} onClick={() => setSelected(d.date)} aria-label={longDate(lang, d.date)}>
              <span className="num">{Number(d.date.slice(8))}</span>
              {d.taps.length > 0 && <><span className="times">{clock(lang, d.firstIn)} – {d.inside ? '…' : clock(lang, d.lastOut)}</span><span className="hrs">{duration(lang, d.minutes)}</span></>}
            </button>)}
          </div>
          <Legend lang={lang} /><p className="rules">{rulesLine(lang, rules)}</p>
        </section>
        <div className="side"><section className="panel ring-card"><Ring totals={totals} label={w.onTime} /><div><span><i className="dot green" />{totals.green}</span><span><i className="dot yellow" />{totals.yellow}</span><span><i className="dot red" />{totals.red}</span></div></section><DayDetail lang={lang} day={day} /></div>
      </div>
    </>}
  </div>;
}

export function YearView({ lang, person, onPerson, onOpenMonth }: { lang: Lang; person: Person | null; onPerson: (p: Person) => void; onOpenMonth: () => void }) {
  const w = t(lang); const [year, setYear] = useState(nowYM().y); const [months, setMonths] = useState<{ month: number; days: Day[]; totals: Totals }[]>([]); const [rules, setRules] = useState<Rules | null>(null);
  useEffect(() => { if (!person) return; void get<{ months: typeof months; rules: Rules }>(`/api/admin/attendance/year?person=${encodeURIComponent(person.key)}&year=${year}`).then(r => { setMonths(r.months); setRules(r.rules); }).catch(() => setMonths([])); }, [person?.key, year]);
  const totals = useMemo(() => totalsOf(months.flatMap(m => m.days)), [months]);
  const maxMinutes = Math.max(1, ...months.map(m => m.totals.minutes));
  return <div className="view">
    <div className="view-head"><div><div className="eyebrow">{w.yearTitle}</div><PersonPicker lang={lang} value={person} onPick={onPerson} /></div><div className="stepper"><button aria-label={w.prev} onClick={() => setYear(year - 1)}>‹</button><strong>{year}</strong><button aria-label={w.next} onClick={() => setYear(year + 1)}>›</button></div></div>
    {!person ? <p className="panel muted">{w.choosePerson}</p> : <>
      <StatCards lang={lang} totals={totals} />
      <section className="panel hours-bars"><h3>{w.totalHours}</h3><div className="bars">{months.map(m => <div key={m.month} className="bar"><span style={{ blockSize: `${(m.totals.minutes / maxMinutes) * 100}%` }} title={duration(lang, m.totals.minutes)} /><small>{shortMonth(lang, m.month)}</small></div>)}</div></section>
      <section className="year-grid">{months.map(m => <article key={m.month} className="panel mini">
        <header><b>{shortMonth(lang, m.month)}</b><span>{duration(lang, m.totals.minutes)}</span></header>
        <div className="mini-cal">{Array.from({ length: m.days[0]?.weekday ?? 0 }, (_, i) => <i key={`p${i}`} className="pad" />)}{m.days.map(d => <i key={d.date} className={d.status} title={`${longDate(lang, d.date)} · ${duration(lang, d.minutes)}`} />)}</div>
        <footer><span><i className="dot green" />{m.totals.green}</span><span><i className="dot yellow" />{m.totals.yellow}</span><span><i className="dot red" />{m.totals.red}</span></footer>
      </article>)}</section>
      <Legend lang={lang} /><p className="rules">{rulesLine(lang, rules)}</p>
      <button className="ghost" onClick={onOpenMonth}>{w.openMonth}</button>
    </>}
  </div>;
}

export function TeamView({ lang, onOpenPerson }: { lang: Lang; onOpenPerson: (p: Person) => void }) {
  const w = t(lang); const start = nowYM(); const [year, setYear] = useState(start.y); const [month, setMonth] = useState(start.m);
  const [rows, setRows] = useState<TeamRow[]>([]); const [rules, setRules] = useState<Rules | null>(null); const [q, setQ] = useState(''); const [dept, setDept] = useState(''); const [manager, setManager] = useState('');
  useEffect(() => { const load = () => void get<{ rows: TeamRow[]; rules: Rules }>(`/api/admin/attendance/team?year=${year}&month=${month}`).then(r => { setRows(r.rows); setRules(r.rules); }).catch(() => setRows([])); load(); const timer = setInterval(load, 30_000); return () => clearInterval(timer); }, [year, month]);
  const departments = [...new Set(rows.map(r => r.person.department).filter(Boolean))] as string[];
  const managers = [...new Set(rows.map(r => r.person.managerEmail).filter(Boolean))] as string[];
  const shown = rows.filter(r => (!dept || r.person.department === dept) && (!manager || r.person.managerEmail === manager) && (!q || `${r.person.name} ${r.person.email}`.toLowerCase().includes(q.toLowerCase())));
  const inside = shown.filter(r => r.today.inside).length, left = shown.filter(r => r.today.taps.length && !r.today.inside).length, notIn = shown.length - inside - left;
  const state = (r: TeamRow) => r.today.inside ? <span className="state in">{w.insideNow} · {w.since} {clock(lang, r.today.firstIn)}</span> : r.today.taps.length ? <span className="state out">{w.leftAt} {clock(lang, r.today.lastOut)}</span> : <span className="state none">{w.notIn}</span>;
  return <div className="view">
    <div className="view-head"><div><div className="eyebrow">{w.teamTitle}</div><h2>{monthName(lang, year, month)}</h2></div><MonthStepper lang={lang} year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} /></div>
    <section className="z-stats three"><article className="green"><strong>{inside}</strong><span>{w.insideCount}</span></article><article><strong>{left}</strong><span>{w.leftCount}</span></article><article className="red"><strong>{notIn}</strong><span>{w.notInCount}</span></article></section>
    <section className="panel">
      <div className="toolbar z"><input value={q} onChange={e => setQ(e.target.value)} placeholder={w.searchPerson} />
        <select value={dept} onChange={e => setDept(e.target.value)}><option value="">{w.allDepartments}</option>{departments.map(d => <option key={d}>{d}</option>)}</select>
        <select value={manager} onChange={e => setManager(e.target.value)}><option value="">{w.allManagers}</option>{managers.map(m => <option key={m}>{m}</option>)}</select></div>
      {!departments.length && <p className="note">{w.teamNote}</p>}
      <div className="table"><table className="team"><thead><tr><th>{w.person}</th><th>{w.today}</th><th>{w.thisMonth}</th><th>{w.hours}</th><th>{w.avg}</th></tr></thead>
        <tbody>{shown.map(r => <tr key={r.person.key} onClick={() => onOpenPerson(r.person)} tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') onOpenPerson(r.person); }}>
          <td><div className="who"><span className="avatar">{initials(r.person.name)}</span><span><b>{r.person.name}</b><small>{r.person.email || w.noEmail}{r.person.department ? ` · ${r.person.department}` : ''}</small></span></div></td>
          <td>{state(r)}</td>
          <td><div className="strip">{r.days.map((s, i) => <i key={i} className={s} />)}</div><small className="counts"><i className="dot green" />{r.totals.green} <i className="dot yellow" />{r.totals.yellow} <i className="dot red" />{r.totals.red}</small></td>
          <td>{duration(lang, r.totals.minutes)}</td><td>{duration(lang, r.totals.averageMinutes)}</td>
        </tr>)}</tbody></table>{!shown.length && <div className="empty">{w.noPeople}</div>}</div>
      <p className="rules">{rulesLine(lang, rules)}</p>
    </section>
  </div>;
}
