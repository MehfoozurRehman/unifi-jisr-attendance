import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import './picker.css';

type Row = { id:number; receivedAt:number; occurredAt:number|null; userId:string|null; name:string|null; employeeName:string|null; direction:string|null; door:string|null; status:string; reason:string };
type Employee = { id:string; code:string; name:string; email:string|null };
const statuses = ['', 'queued', 'held', 'skipped', 'duplicate', 'sending', 'submitted', 'uncertain', 'confirmed', 'failed'];
const local = (value:number|null) => value ? new Intl.DateTimeFormat('en-GB', { timeZone:'Asia/Riyadh', dateStyle:'medium', timeStyle:'medium' }).format(value) : 'No valid time';

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
  const load=async()=>{const summaryResponse=await fetch('/api/admin/summary');if(summaryResponse.status===401){setAuth(false);return}const summary=await summaryResponse.json();const eventResponse=await fetch(`/api/admin/events?status=${status}&q=${encodeURIComponent(query)}`);const list=await eventResponse.json();setAuth(true);setCounts(summary.counts);setPaused(summary.paused);setRows(list.rows);setError(summary.employeeError||'')};
  useEffect(()=>{void load();const timer=setInterval(()=>void load(),5000);return()=>clearInterval(timer)},[status,query]);
  useEffect(()=>{if(!selected)return;const timer=setTimeout(async()=>{const response=await fetch(`/api/admin/employees?q=${encodeURIComponent(employeeQuery)}`);if(response.ok)setEmployees(await response.json())},200);return()=>clearTimeout(timer)},[selected,employeeQuery]);
  const login=async(event:React.FormEvent)=>{event.preventDefault();const response=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});if(response.ok)void load();else setError('Incorrect password')};
  const mapEmployee=async(employeeId:string)=>{if(!selected?.userId)return;await fetch('/api/admin/map',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:selected.userId,employeeId})});await fetch(`/api/admin/events/${selected.id}/retry`,{method:'POST'});setSelected(null);void load()};
  if(auth===null)return <main className="center">Loading…</main>;
  if(!auth)return <main className="center"><form className="login" onSubmit={login}><div className="brand">Attendance Control</div><p>Sign in to the company attendance ledger.</p><input autoFocus type="password" value={password} onChange={event=>setPassword(event.target.value)} placeholder="Dashboard password"/><button>Sign in</button>{error&&<p className="danger">{error}</p>}</form></main>;
  return <main>
    <header><div><div className="eyebrow">UNIFI → JISR</div><h1>Attendance ledger</h1><p>Source events, decisions, and confirmed Jisr punches in Riyadh time.</p></div><button className={paused?'resume':'pause'} onClick={async()=>{await fetch('/api/admin/pause',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({paused:!paused})});void load()}}>{paused?'Resume processing':'Pause processing'}</button></header>
    {error&&<div className="alert">Employee sync: {error}</div>}
    <section className="stats">{statuses.slice(1).map(value=><button key={value} className={status===value?'active':''} onClick={()=>setStatus(status===value?'':value)}><strong>{counts[value]||0}</strong><span>{value}</span></button>)}</section>
    <section className="panel"><div className="toolbar"><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search employee, door, or reason"/><select value={status} onChange={event=>setStatus(event.target.value)}>{statuses.map(value=><option key={value} value={value}>{value||'All statuses'}</option>)}</select></div><div className="table"><table><thead><tr><th>Event time</th><th>Person</th><th>Movement</th><th>Reader</th><th>Status</th><th>Decision</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td>{local(row.occurredAt)}<small>Received {local(row.receivedAt)}</small></td><td>{row.employeeName||row.name||'Unknown'}{row.status==='held'&&row.userId&&<button className="link" onClick={()=>{setSelected(row);setEmployeeQuery(row.name||'')}}>Match employee</button>}</td><td><b className={`direction ${row.direction}`}>{row.direction?.toUpperCase()||'—'}</b></td><td>{row.door||'—'}</td><td><span className={`badge ${row.status}`}>{row.status}</span></td><td>{row.reason}<small>Event #{row.id}</small></td></tr>)}</tbody></table>{!rows.length&&<div className="empty">No events match this view.</div>}</div></section>
    {selected&&<div className="overlay" onClick={()=>setSelected(null)}><section className="picker" onClick={event=>event.stopPropagation()}><h2>Match {selected.name}</h2><p>This permanent mapping uses the UniFi user ID and remains reliable if the display name changes.</p><input autoFocus value={employeeQuery} onChange={event=>setEmployeeQuery(event.target.value)} placeholder="Search Jisr employees"/><div className="employees">{employees.map(employee=><button key={employee.id} onClick={()=>void mapEmployee(employee.id)}><strong>{employee.name}</strong><span>Code {employee.code}{employee.email?` · ${employee.email}`:''}</span></button>)}</div><button className="cancel" onClick={()=>setSelected(null)}>Cancel</button></section></div>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
