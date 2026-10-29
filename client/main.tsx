import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './app.css';
import { Dashboard, Employee, RangePicker, go, initials, presetRange, type Person, type Preset, type Range } from './pages';
import { t, todayLong, type Lang } from './i18n';

const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* storage unavailable */ } };
const route = () => { const h = location.hash.replace(/^#/, ''); if (h.startsWith('/employee/')) return { page: 'employee' as const, key: decodeURIComponent(h.slice('/employee/'.length)) }; if (h === '/events') return { page: 'events' as const }; return { page: 'dashboard' as const }; };

/* ---------- search ---------- */
function Search({ lang }: { lang: Lang }) {
  const w = t(lang); const [q, setQ] = useState(''); const [list, setList] = useState<Person[]>([]); const [open, setOpen] = useState(false);
  useEffect(() => { if (!q.trim()) { setList([]); return; } const timer = setTimeout(() => void fetch(`/api/admin/people?q=${encodeURIComponent(q)}`).then(r => r.ok ? r.json() : []).then(setList).catch(() => setList([])), 150); return () => clearTimeout(timer); }, [q]);
  const pick = (p: Person) => { go(`#/employee/${encodeURIComponent(p.key)}`); setQ(''); setOpen(false); };
  return <div className="search">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 3a7 7 0 0 1 5.6 11.2l5.1 5.1-1.4 1.4-5.1-5.1A7 7 0 1 1 10 3Zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z" /></svg>
    <input value={q} placeholder={w.search} onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onKeyDown={e => { if (e.key === 'Enter' && list[0]) pick(list[0]); }} aria-label={w.search} />
    {open && list.length > 0 && <div className="search-menu">{list.slice(0, 8).map(p => <button key={p.key} onMouseDown={() => pick(p)}><span className="avatar sm">{initials(p.name)}</span><span><b>{p.name}</b><small>{p.email || w.noEmail}</small></span></button>)}</div>}
  </div>;
}

/* ---------- event ledger (unchanged behaviour) ---------- */
type Row = { id:number; receivedAt:number; occurredAt:number|null; userId:string|null; name:string|null; email:string|null; employeeName:string|null; employeeCode:string|null; direction:string|null; door:string|null; status:string; reason:string };
type JisrEmployee = { id:string; code:string; name:string; email:string|null };
const statuses = ['', 'queued', 'held', 'skipped', 'duplicate', 'sending', 'submitted', 'uncertain', 'confirmed', 'failed'];
const stamp = (value:number|null) => value ? new Intl.DateTimeFormat('en-GB', { timeZone:'Asia/Riyadh', dateStyle:'medium', timeStyle:'medium' }).format(value) : 'No valid time';
const match = (row:Row) => row.employeeCode ? { tone:'confirmed', label:`Matched · code ${row.employeeCode}` } : row.email ? { tone:'queued', label:'Email found · not matched yet' } : { tone:'held', label:'No email' };
function Ledger() {
  const [rows,setRows]=useState<Row[]>([]); const [counts,setCounts]=useState<Record<string,number>>({}); const [status,setStatus]=useState(''); const [query,setQuery]=useState('');
  const [paused,setPaused]=useState(false); const [error,setError]=useState(''); const [selected,setSelected]=useState<Row|null>(null); const [employees,setEmployees]=useState<JisrEmployee[]>([]); const [employeeQuery,setEmployeeQuery]=useState('');
  const load=async()=>{const s=await fetch('/api/admin/summary');if(!s.ok)return;const summary=await s.json();const list=await (await fetch(`/api/admin/events?status=${status}&q=${encodeURIComponent(query)}`)).json();setCounts(summary.counts);setPaused(summary.paused);setRows(list.rows);setError(summary.employeeError||'')};
  useEffect(()=>{void load();const timer=setInterval(()=>void load(),5000);return()=>clearInterval(timer)},[status,query]);
  useEffect(()=>{if(!selected)return;const timer=setTimeout(async()=>{const r=await fetch(`/api/admin/employees?q=${encodeURIComponent(employeeQuery)}`);if(r.ok)setEmployees(await r.json())},200);return()=>clearTimeout(timer)},[selected,employeeQuery]);
  const mapEmployee=async(employeeId:string)=>{if(!selected)return;await fetch('/api/admin/map',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({eventId:selected.id,employeeId})});await fetch(`/api/admin/events/${selected.id}/retry`,{method:'POST'});setSelected(null);void load()};
  return <div className="page ledger" dir="ltr">
    <div className="ledger-head"><div><h2>Event ledger</h2><p>Source events, decisions, and confirmed Jisr punches in Riyadh time.</p></div><button className="btn" onClick={async()=>{await fetch('/api/admin/pause',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({paused:!paused})});void load()}}>{paused?'Resume processing':'Pause processing'}</button></div>
    {error&&<div className="alert">Employee sync: {error}</div>}
    <div className="status-row">{statuses.slice(1).map(value=><button key={value} className={`card stat${status===value?' on':''}`} onClick={()=>setStatus(status===value?'':value)}><strong>{counts[value]||0}</strong><span>{value}</span></button>)}</div>
    <section className="card"><div className="ledger-tools"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search employee, door, or reason"/><select value={status} onChange={e=>setStatus(e.target.value)}>{statuses.map(v=><option key={v} value={v}>{v||'All statuses'}</option>)}</select></div>
      <div className="table-wrap"><table className="people"><thead><tr><th>Event time</th><th>Person</th><th>Movement</th><th>Reader</th><th>Status</th><th>Decision</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td>{stamp(row.occurredAt)}<small>Received {stamp(row.receivedAt)}</small></td><td>{row.employeeName||row.name||'Unknown'}<small>{row.email||'No email from UniFi'}</small><span className={`tag ${match(row).tone}`}>{match(row).label}</span>{row.status==='held'&&<button className="link" onClick={()=>{setSelected(row);setEmployeeQuery('')}}>{row.email?'Choose employee':'Enter employee email'}</button>}</td><td><b className={`dir ${row.direction}`}>{row.direction?.toUpperCase()||'—'}</b></td><td>{row.door||'—'}</td><td><span className={`tag ${row.status}`}>{row.status}</span></td><td>{row.reason}<small>Event #{row.id}</small></td></tr>)}</tbody></table>{!rows.length&&<p className="muted">No events match this view.</p>}</div></section>
    {selected&&<div className="overlay" onClick={()=>setSelected(null)}><section className="card dialog" onClick={e=>e.stopPropagation()}><h2>Enter employee email</h2><p>Automatic matching uses email only. Enter the employee email from Jisr and select the result.</p><input autoFocus value={employeeQuery} onChange={e=>setEmployeeQuery(e.target.value)} placeholder="Employee email"/><div className="dialog-list">{employees.map(emp=><button key={emp.id} onClick={()=>void mapEmployee(emp.id)}><strong>{emp.email}</strong><span>{emp.name} · Code {emp.code}</span></button>)}</div><button className="btn" onClick={()=>setSelected(null)}>Cancel</button></section></div>}
  </div>;
}

/* ---------- app ---------- */
function App() {
  const [auth, setAuth] = useState<boolean | null>(null); const [password, setPassword] = useState(''); const [error, setError] = useState('');
  const [lang, setLangState] = useState<Lang>(() => (read('zood.lang') === 'en' ? 'en' : 'ar'));
  const [range, setRangeState] = useState<Range>(() => { const p = read('zood.range') as Preset | null; return presetRange(p && ['7', '30', '90', 'month', 'year'].includes(p) ? p : '30'); });
  const [where, setWhere] = useState(route());
  useEffect(() => { const on = () => { setWhere(route()); window.scrollTo(0, 0); }; window.addEventListener('hashchange', on); return () => window.removeEventListener('hashchange', on); }, []);
  useEffect(() => { void fetch('/api/admin/summary').then(r => setAuth(r.ok)).catch(() => setAuth(false)); }, []);
  useEffect(() => { document.documentElement.lang = lang; document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'; }, [lang]);
  const setLang = (l: Lang) => { setLangState(l); write('zood.lang', l); };
  const setRange = (r: Range) => { setRangeState(r); if (r.preset !== 'custom') write('zood.range', r.preset); };
  const w = t(lang);
  const login = async (e: React.FormEvent) => { e.preventDefault(); const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) }); if (r.ok) setAuth(true); else setError(lang === 'ar' ? 'كلمة المرور غير صحيحة' : 'Incorrect password'); };
  if (auth === null) return <div className="loading">…</div>;
  if (!auth) return <main className="login-page"><form className="card login" onSubmit={login}><img src="/brand/logo-white-crop.png" alt="ZOOD زود" onError={e => { e.currentTarget.style.display = 'none'; }} /><h1>{w.product}</h1><input autoFocus type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={lang === 'ar' ? 'كلمة مرور اللوحة' : 'Dashboard password'} /><button className="btn primary">{lang === 'ar' ? 'دخول' : 'Sign in'}</button>{error && <p className="error">{error}</p>}<button type="button" className="link" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>{w.language}</button></form></main>;
  return <div className="app">
    <header className="topbar">
      <a className="brand" href="#/" aria-label={w.dashboard}><img src="/brand/logo-white-crop.png" alt="ZOOD زود" onError={e => { e.currentTarget.replaceWith(Object.assign(document.createElement('b'), { textContent: 'ZOOD' })); }} /><span><b>{w.product}</b><small>{todayLong(lang)}</small></span></a>
      <Search lang={lang} />
      <div className="top-actions">
        {where.page !== 'events' && <RangePicker lang={lang} range={range} onChange={setRange} />}
        <a className={`chip${where.page === 'dashboard' ? ' on' : ''}`} href="#/">{w.dashboard}</a>
        <a className={`chip${where.page === 'events' ? ' on' : ''}`} href="#/events">{w.events}</a>
        <button className="chip" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>{w.language}</button>
        <button className="icon-btn" aria-label={w.signOut} title={w.signOut} onClick={async () => { await fetch('/api/logout', { method: 'POST' }); location.reload(); }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 3H4v18h6v-2H6V5h4Zm6 4-1.4 1.4 2.6 2.6H9v2h8.2l-2.6 2.6L16 17l5-5Z" /></svg></button>
      </div>
    </header>
    {where.page === 'dashboard' && <Dashboard lang={lang} range={range} />}
    {where.page === 'employee' && <Employee lang={lang} range={range} personKey={where.key} />}
    {where.page === 'events' && <Ledger />}
  </div>;
}
createRoot(document.getElementById('root')!).render(<App />);
