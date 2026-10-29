import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import './picker.css';
import './zood.css';
import { MonthView, TeamView, YearView, type Person } from './attendance';
import { t, type Lang } from './i18n';

type Page = 'team' | 'month' | 'year' | 'ledger';
const saved = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => { try { const value = localStorage.getItem(key) as T | null; return value && allowed.includes(value) ? value : fallback; } catch { return fallback; } };
const remember = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* storage unavailable */ } };
const icons: Record<Page, string> = { team: 'M16 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm0 2c-2.3 0-7 1.2-7 3.5V19h14v-2.5C15 14.2 10.3 13 8 13Zm8 0c-.3 0-.6 0-1 .1a4.2 4.2 0 0 1 2 3.4V19h6v-2.5c0-2.3-4.7-3.5-7-3.5Z', month: 'M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2Zm-2 8h14v10H5Zm2 2v2h2v-2Zm4 0v2h2v-2Zm4 0v2h2v-2Z', year: 'M4 20h16v2H4Zm1-3h3V9H5Zm5.5 0h3V4h-3Zm5.5 0h3v-6h-3Z', ledger: 'M4 5h16v2H4Zm0 6h16v2H4Zm0 6h10v2H4Z' };

function Shell({ lang, setLang, page, setPage, children }: { lang: Lang; setLang: (l: Lang) => void; page: Page; setPage: (p: Page) => void; children: React.ReactNode }) {
  const w = t(lang);
  const today = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', { timeZone: 'Asia/Riyadh', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  return <div className="zood" dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang}>
    <nav className="rail" aria-label={w.product}>
      <img className="mark" src="/brand/mark-white.png" alt={w.brand} onError={e => { e.currentTarget.style.display = 'none'; }} />
      {(['team', 'month', 'year', 'ledger'] as const).map(p => <button key={p} className={page === p ? 'active' : ''} aria-current={page === p ? 'page' : undefined} onClick={() => setPage(p)} title={w[p]}><svg viewBox="0 0 24 24" aria-hidden="true"><path d={icons[p]} /></svg><span>{w[p]}</span></button>)}
      <button className="rail-bottom" onClick={async () => { await fetch('/api/logout', { method: 'POST' }); location.reload(); }} title={w.signOut}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 3H4v18h6v-2H6V5h4Zm6 4-1.4 1.4 2.6 2.6H9v2h8.2l-2.6 2.6L16 17l5-5Z" /></svg><span>{w.signOut}</span></button>
    </nav>
    <div className="stage">
      <header className="topbar"><div className="title"><img className="logo" src="/brand/logo-white-crop.png" alt="ZOOD زود" onError={e => { e.currentTarget.replaceWith(Object.assign(document.createElement('b'), { textContent: 'ZOOD' })); }} /><span>{w.product}</span></div><div className="meta"><span className="date">{today}</span><button className="lang" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>{w.language}</button></div></header>
      {children}
    </div>
  </div>;
}

type Row = { id:number; receivedAt:number; occurredAt:number|null; userId:string|null; name:string|null; email:string|null; employeeName:string|null; employeeCode:string|null; direction:string|null; door:string|null; status:string; reason:string };
type Employee = { id:string; code:string; name:string; email:string|null };
const statuses = ['', 'queued', 'held', 'skipped', 'duplicate', 'sending', 'submitted', 'uncertain', 'confirmed', 'failed'];
const local = (value:number|null) => value ? new Intl.DateTimeFormat('en-GB', { timeZone:'Asia/Riyadh', dateStyle:'medium', timeStyle:'medium' }).format(value) : 'No valid time';

const match = (row:Row) => row.employeeCode ? { tone:'confirmed', label:`Matched · code ${row.employeeCode}` } : row.email ? { tone:'queued', label:'Email found · not matched yet' } : { tone:'held', label:'No email' };

function App() {
  const [auth,setAuth]=useState<boolean|null>(null);
  const [password,setPassword]=useState('');
  const [rows,setRows]=useState<Row[]>([]);
  const [counts,setCounts]=useState<Record<string,number>>({});
  const [status,setStatus]=useState('');
  const [query,setQuery]=useState('');
  const [paused,setPaused]=useState(false);
  const [error,setError]=useState('');
  const [selected,setSelected]=useState<Row|null>(null);
  const [employees,setEmployees]=useState<Employee[]>([]);
  const [employeeQuery,setEmployeeQuery]=useState('');
  const [lang,setLangState]=useState<Lang>(()=>saved('zood.lang',['ar','en'] as const,'ar'));
  const [page,setPageState]=useState<Page>(()=>saved('zood.page',['team','month','year','ledger'] as const,'team'));
  const [person,setPersonState]=useState<Person|null>(()=>{try{const value=JSON.parse(localStorage.getItem('zood.person')||'null');return value&&typeof value.key==='string'?value:null}catch{return null}});
  const setPerson=(value:Person)=>{setPersonState(value);remember('zood.person',JSON.stringify(value))};
  const setLang=(value:Lang)=>{setLangState(value);remember('zood.lang',value)};
  const setPage=(value:Page)=>{setPageState(value);remember('zood.page',value)};
  const load=async()=>{const summaryResponse=await fetch('/api/admin/summary');if(summaryResponse.status===401){setAuth(false);return}const summary=await summaryResponse.json();const eventResponse=await fetch(`/api/admin/events?status=${status}&q=${encodeURIComponent(query)}`);const list=await eventResponse.json();setAuth(true);setCounts(summary.counts);setPaused(summary.paused);setRows(list.rows);setError(summary.employeeError||'')};
  useEffect(()=>{void load();const timer=setInterval(()=>void load(),5000);return()=>clearInterval(timer)},[status,query]);
  useEffect(()=>{if(!selected)return;const timer=setTimeout(async()=>{const response=await fetch(`/api/admin/employees?q=${encodeURIComponent(employeeQuery)}`);if(response.ok)setEmployees(await response.json())},200);return()=>clearTimeout(timer)},[selected,employeeQuery]);
  const login=async(event:React.FormEvent)=>{event.preventDefault();const response=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});if(response.ok)void load();else setError('Incorrect password')};
  const mapEmployee=async(employeeId:string)=>{if(!selected)return;await fetch('/api/admin/map',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({eventId:selected.id,employeeId})});await fetch(`/api/admin/events/${selected.id}/retry`,{method:'POST'});setSelected(null);void load()};
  if(auth===null)return <main className="center">Loading…</main>;
  if(!auth)return <main className="center zood-login"><form className="login" onSubmit={login}><img className="login-logo" src="/brand/logo-white-crop.png" alt="ZOOD زود" onError={event=>{event.currentTarget.style.display='none'}}/><div className="brand">{t(lang).product}</div><p>Sign in to the company attendance ledger.</p><input autoFocus type="password" value={password} onChange={event=>setPassword(event.target.value)} placeholder="Dashboard password"/><button>Sign in</button>{error&&<p className="danger">{error}</p>}</form></main>;
  if(page!=='ledger')return <Shell lang={lang} setLang={setLang} page={page} setPage={setPage}>
    {page==='team'&&<TeamView lang={lang} onOpenPerson={p=>{setPerson(p);setPage('month')}}/>}
    {page==='month'&&<MonthView lang={lang} person={person} onPerson={setPerson}/>}
    {page==='year'&&<YearView lang={lang} person={person} onPerson={setPerson} onOpenMonth={()=>setPage('month')}/>}
  </Shell>;
  return <Shell lang={lang} setLang={setLang} page={page} setPage={setPage}><main className="ledger" dir="ltr">
    <header><div><div className="eyebrow">UNIFI → JISR</div><h1>Attendance ledger</h1><p>Source events, decisions, and confirmed Jisr punches in Riyadh time.</p></div><button className={paused?'resume':'pause'} onClick={async()=>{await fetch('/api/admin/pause',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({paused:!paused})});void load()}}>{paused?'Resume processing':'Pause processing'}</button></header>
    {error&&<div className="alert">Employee sync: {error}</div>}
    <section className="stats">{statuses.slice(1).map(value=><button key={value} className={status===value?'active':''} onClick={()=>setStatus(status===value?'':value)}><strong>{counts[value]||0}</strong><span>{value}</span></button>)}</section>
    <section className="panel"><div className="toolbar"><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search employee, door, or reason"/><select value={status} onChange={event=>setStatus(event.target.value)}>{statuses.map(value=><option key={value} value={value}>{value||'All statuses'}</option>)}</select></div><div className="table"><table><thead><tr><th>Event time</th><th>Person</th><th>Movement</th><th>Reader</th><th>Status</th><th>Decision</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td>{local(row.occurredAt)}<small>Received {local(row.receivedAt)}</small></td><td>{row.employeeName||row.name||'Unknown'}<small>{row.email||'No email from UniFi'}</small><span className={`badge chip ${match(row).tone}`}>{match(row).label}</span>{row.status==='held'&&<button className="link" onClick={()=>{setSelected(row);setEmployeeQuery('')}}>{row.email?'Choose employee':'Enter employee email'}</button>}</td><td><b className={`direction ${row.direction}`}>{row.direction?.toUpperCase()||'—'}</b></td><td>{row.door||'—'}</td><td><span className={`badge ${row.status}`}>{row.status}</span></td><td>{row.reason}<small>Event #{row.id}</small></td></tr>)}</tbody></table>{!rows.length&&<div className="empty">No events match this view.</div>}</div></section>
    {selected&&<div className="overlay" onClick={()=>setSelected(null)}><section className="picker" onClick={event=>event.stopPropagation()}><h2>Enter employee email</h2><p>Automatic matching uses email only. Enter the employee email from Jisr and select the result.</p><input autoFocus value={employeeQuery} onChange={event=>setEmployeeQuery(event.target.value)} placeholder="Employee email"/><div className="employees">{employees.map(employee=><button key={employee.id} onClick={()=>void mapEmployee(employee.id)}><strong>{employee.email}</strong><span>{employee.name} · Code {employee.code}</span></button>)}</div><button className="cancel" onClick={()=>setSelected(null)}>Cancel</button></section></div>}
  </main></Shell>;
}
createRoot(document.getElementById('root')!).render(<App/>);
