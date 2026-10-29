import React, { useState } from 'react';
import { clock, duration, longDate, minuteClock, monthShort, shortDate, t, weekdayShort, type Lang } from './i18n';

// Validated on the dark panel (#151b2c): status steps from the reference status palette, a one-hue sand ramp for magnitude.
export const STATUS = { good: '#0ca30c', warning: '#fab219', critical: '#d03b3b' } as const;
const RAMP = ['#615248', '#86705f', '#ac917e', '#d1b4a2', '#efdccf'];
const EMPTY = '#1f2740';
export const rampColor = (value: number, max: number) => value <= 0 || max <= 0 ? EMPTY : RAMP[Math.min(RAMP.length - 1, Math.floor((value / max) * RAMP.length))];

export type DailyPoint = { date: string; workday: boolean; tracked: boolean; present: number; onTime: number; late: number; absent: number; minutes: number; averageMinutes: number };
export type Tap = { at: number; direction: 'in' | 'out' };
export type Day = { date: string; weekday: number; workday: boolean; status: string; firstIn: number | null; lastOut: number | null; minutes: number; late: boolean; short: boolean; missingOut: boolean; missingIn: boolean; inside: boolean; taps: Tap[] };

/* ---------- tooltip ---------- */
type TipState = { x: number; y: number; content: React.ReactNode } | null;
export function useTip() {
  const [tip, setTip] = useState<TipState>(null);
  const show = (event: React.PointerEvent | React.FocusEvent, content: React.ReactNode) => {
    const rect = 'clientX' in event ? { x: event.clientX, y: event.clientY } : (() => { const r = (event.target as Element).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top }; })();
    setTip({ ...rect, content });
  };
  return { tip, show, hide: () => setTip(null) };
}
export function Tip({ tip }: { tip: TipState }) {
  if (!tip) return null;
  const left = Math.min(Math.max(tip.x + 14, 8), window.innerWidth - 240);
  return <div className="tip" role="tooltip" style={{ left, top: Math.max(tip.y - 12, 8) }}>{tip.content}</div>;
}
const Row = ({ color, label, value }: { color?: string; label: string; value: React.ReactNode }) =>
  <div className="tip-row">{color && <i style={{ background: color }} />}<b>{value}</b><span>{label}</span></div>;

/* ---------- daily stacked attendance (team) ---------- */
export function DailyAttendance({ lang, data }: { lang: Lang; data: DailyPoint[] }) {
  const w = t(lang), { tip, show, hide } = useTip();
  const W = 760, H = 220, pad = { l: 34, r: 8, t: 10, b: 26 };
  const max = Math.max(1, ...data.map(d => d.onTime + d.late + d.absent));
  const step = (W - pad.l - pad.r) / Math.max(data.length, 1), bar = Math.max(2, Math.min(22, step - 2));
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const ticks = [0, Math.round(max / 2), max];
  const labelEvery = Math.ceil(data.length / 8);
  return <div className="chart" dir="ltr">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={w.dailyAttendance}>
      {ticks.map(v => <g key={v}><line className="grid" x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} /><text className="axis" x={pad.l - 8} y={y(v) + 4} textAnchor="end">{v}</text></g>)}
      {data.map((d, i) => {
        const x = pad.l + i * step + (step - bar) / 2;
        const parts = [{ v: d.onTime, c: STATUS.good }, { v: d.late, c: STATUS.warning }, { v: d.absent, c: STATUS.critical }];
        let acc = 0;
        return <g key={d.date} className="col" tabIndex={0} onPointerMove={e => show(e, <><strong>{longDate(lang, d.date)}</strong><Row color={STATUS.good} label={w.onTime} value={d.onTime} /><Row color={STATUS.warning} label={w.late} value={d.late} /><Row color={STATUS.critical} label={w.absent} value={d.absent} /><Row label={w.averageDay} value={duration(lang, d.averageMinutes)} /></>)} onFocus={e => show(e, <><strong>{longDate(lang, d.date)}</strong><Row label={w.present} value={d.present} /></>)} onPointerLeave={hide} onBlur={hide}>
          <rect className="hit" x={pad.l + i * step} y={pad.t} width={step} height={H - pad.t - pad.b} />
          {!d.tracked && <rect className="untracked" x={x} y={H - pad.b - 3} width={bar} height={3} rx={1.5} />}
          {parts.map((p, j) => { if (!p.v) return null; const top = y(acc + p.v), h = y(acc) - top - (acc ? 2 : 0); acc += p.v; return <rect key={j} x={x} y={top} width={bar} height={Math.max(h, 1)} rx={Math.min(4, bar / 2)} fill={p.c} />; })}
          {i % labelEvery === 0 && <text className="axis" x={x + bar / 2} y={H - 8} textAnchor="middle">{shortDate(lang, d.date)}</text>}
        </g>;
      })}
    </svg>
    <Legend items={[[STATUS.good, w.onTime], [STATUS.warning, w.late], [STATUS.critical, w.absent]]} />
    <Tip tip={tip} />
  </div>;
}

export const Legend = ({ items }: { items: [string, string][] }) => <div className="legend">{items.map(([c, l]) => <span key={l}><i style={{ background: c }} />{l}</span>)}</div>;

/* ---------- GitHub-style year grid ---------- */
export function YearGrid({ lang, days, perPerson }: { lang: Lang; days: { date: string; minutes: number; present: number; tracked: boolean; workday: boolean }[]; perPerson?: boolean }) {
  const w = t(lang), { tip, show, hide } = useTip();
  const cell = 12, gap = 3, left = 54, top = 18;
  const max = Math.max(1, ...days.map(d => d.minutes));
  const weeks = Math.ceil(days.length / 7);
  const W = left + weeks * (cell + gap), H = top + 7 * (cell + gap);
  return <div className="chart scroll-x" dir="ltr">
    <svg className="fixed" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={w.yearActivity}>
      {[1, 3, 5].map(r => <text key={r} className="axis" x={left - 6} y={top + r * (cell + gap) + cell - 2} textAnchor="end">{weekdayShort(lang, r)}</text>)}
      {days.map((d, i) => {
        const col = Math.floor(i / 7), row = i % 7, x = left + col * (cell + gap), y = top + row * (cell + gap);
        const label = <><strong>{longDate(lang, d.date)}</strong>{d.tracked ? <><Row label={w.hoursAxis} value={duration(lang, d.minutes)} />{!perPerson && <Row label={w.present} value={d.present} />}</> : <span className="muted">{w.beforeRecording}</span>}</>;
        return <g key={d.date}>
          {row === 0 && d.date.slice(8) <= '07' && <text className="axis" x={x} y={11}>{monthShort(lang, d.date)}</text>}
          <rect className={`cell${d.tracked ? '' : ' off'}`} x={x} y={y} width={cell} height={cell} rx={3} fill={d.tracked ? rampColor(d.minutes, max) : 'transparent'} tabIndex={-1} onPointerMove={e => show(e, label)} onPointerLeave={hide} />
        </g>;
      })}
    </svg>
    <div className="ramp-legend"><span>{w.less}</span>{[EMPTY, ...RAMP].map(c => <i key={c} style={{ background: c }} />)}<span>{w.more}</span></div>
    <Tip tip={tip} />
  </div>;
}

/* ---------- weekday x hour activity ---------- */
export function WeekHours({ lang, matrix, fromHour = 6, toHour = 21 }: { lang: Lang; matrix: number[][]; fromHour?: number; toHour?: number }) {
  const w = t(lang), { tip, show, hide } = useTip();
  const hours = Array.from({ length: toHour - fromHour + 1 }, (_, i) => fromHour + i);
  const max = Math.max(0.0001, ...matrix.flat());
  return <div className="weekhours" dir="ltr">
    <div className="wh-grid" style={{ gridTemplateColumns: `44px repeat(7, 1fr)` }}>
      <span />{Array.from({ length: 7 }, (_, d) => <span key={d} className="axis center">{weekdayShort(lang, d)}</span>)}
      {hours.map(h => <React.Fragment key={h}>
        <span className="axis">{String(h).padStart(2, '0')}:00</span>
        {Array.from({ length: 7 }, (_, d) => { const v = matrix[d]?.[h] ?? 0; return <i key={d} className="wh-cell" style={{ background: rampColor(v, max) }} onPointerMove={e => show(e, <><strong>{weekdayShort(lang, d)} · {String(h).padStart(2, '0')}:00</strong><Row label={w.peopleInside} value={v} /></>)} onPointerLeave={hide} />; })}
      </React.Fragment>)}
    </div>
    <div className="ramp-legend"><span>{w.less}</span>{[EMPTY, ...RAMP].map(c => <i key={c} style={{ background: c }} />)}<span>{w.more}</span></div>
    <Tip tip={tip} />
  </div>;
}

/* ---------- time-of-day histogram ---------- */
export function TimeHistogram({ lang, bins, title, marker }: { lang: Lang; bins: { start: number; count: number }[]; title: string; marker?: number }) {
  const w = t(lang), { tip, show, hide } = useTip();
  const W = 360, H = 200, pad = { l: 8, r: 8, t: 18, b: 24 };
  const max = Math.max(1, ...bins.map(b => b.count)), step = (W - pad.l - pad.r) / bins.length, bar = step - 3;
  const first = bins[0]?.start ?? 0, span = bins.length * 30;
  const xOf = (minute: number) => pad.l + ((minute - first) / span) * (W - pad.l - pad.r);
  return <div className="chart" dir="ltr">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
      <line className="grid" x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} />
      {bins.map((b, i) => { const h = ((H - pad.t - pad.b) * b.count) / max; return <g key={b.start} onPointerMove={e => show(e, <><strong>{minuteClock(b.start)}–{minuteClock(b.start + 30)}</strong><Row label={w.count} value={b.count} /></>)} onPointerLeave={hide}>
        <rect className="hit" x={pad.l + i * step} y={pad.t} width={step} height={H - pad.t - pad.b} />
        {b.count > 0 && <rect x={pad.l + i * step + 1.5} y={H - pad.b - h} width={bar} height={h} rx={4} fill={RAMP[3]} />}
        {b.start % 60 === 0 && <text className="axis" x={pad.l + i * step} y={H - 8}>{minuteClock(b.start).slice(0, 2)}</text>}
      </g>; })}
      {marker !== undefined && marker >= first && marker <= first + span && <g><line className="ref" x1={xOf(marker)} x2={xOf(marker)} y1={pad.t} y2={H - pad.b} /><text className="axis ref-label" x={xOf(marker)} y={pad.t - 2} textAnchor="middle">{minuteClock(marker)}</text></g>}
    </svg>
    <Tip tip={tip} />
  </div>;
}

/* ---------- per-day hours (employee) ---------- */
const statusColor = (s: string) => s === 'green' ? STATUS.good : s === 'yellow' ? STATUS.warning : s === 'red' ? STATUS.critical : s === 'today' ? RAMP[3] : 'transparent';
export function DailyHours({ lang, days, required }: { lang: Lang; days: Day[]; required: number }) {
  const w = t(lang), { tip, show, hide } = useTip();
  const W = 760, H = 220, pad = { l: 34, r: 8, t: 10, b: 26 };
  const max = Math.max(required * 1.25, ...days.map(d => d.minutes));
  const step = (W - pad.l - pad.r) / Math.max(days.length, 1), bar = Math.max(2, Math.min(22, step - 2));
  const y = (m: number) => pad.t + (H - pad.t - pad.b) * (1 - m / max);
  const labelEvery = Math.ceil(days.length / 8);
  const ticks = [0, 4 * 60, 8 * 60, 12 * 60].filter(v => v <= max);
  return <div className="chart" dir="ltr">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={w.dailyHours}>
      {ticks.map(v => <g key={v}><line className="grid" x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} /><text className="axis" x={pad.l - 8} y={y(v) + 4} textAnchor="end">{v / 60}{w.h}</text></g>)}
      <line className="ref" x1={pad.l} x2={W - pad.r} y1={y(required)} y2={y(required)} />
      {days.map((d, i) => { const x = pad.l + i * step + (step - bar) / 2; return <g key={d.date} onPointerMove={e => show(e, <DayTip lang={lang} day={d} />)} onPointerLeave={hide}>
        <rect className="hit" x={pad.l + i * step} y={pad.t} width={step} height={H - pad.t - pad.b} />
        {d.status === 'red' && !d.taps.length && <rect x={x} y={H - pad.b - 3} width={bar} height={3} rx={1.5} fill={STATUS.critical} />}
        {d.minutes > 0 && <rect x={x} y={y(d.minutes)} width={bar} height={H - pad.b - y(d.minutes)} rx={Math.min(4, bar / 2)} fill={statusColor(d.status)} />}
        {i % labelEvery === 0 && <text className="axis" x={x + bar / 2} y={H - 8} textAnchor="middle">{shortDate(lang, d.date)}</text>}
      </g>; })}
    </svg>
    <Legend items={[[STATUS.good, w.onTime], [STATUS.warning, w.late], [STATUS.critical, w.absent], [RAMP[3], w.today]]} />
    <Tip tip={tip} />
  </div>;
}
export function DayTip({ lang, day }: { lang: Lang; day: Day }) {
  const w = t(lang);
  const label = day.status === 'green' ? w.onTime : day.status === 'yellow' ? w.late : day.status === 'red' ? w.absent : day.status === 'off' ? w.weekend : day.status === 'untracked' ? w.beforeRecording : w.today;
  return <><strong>{longDate(lang, day.date)}</strong><Row color={statusColor(day.status) === 'transparent' ? undefined : statusColor(day.status)} label={w.status} value={label} /><Row label={w.worked} value={duration(lang, day.minutes)} /><Row label={w.firstIn} value={clock(lang, day.firstIn)} /><Row label={w.lastOut} value={day.inside ? w.inside : clock(lang, day.lastOut)} />{day.missingIn && <span className="muted">{w.exitNoEntry}</span>}{day.missingOut && <span className="muted">{w.noExit}</span>}</>;
}

/* ---------- arrival times per day (employee) ---------- */
export function ArrivalDots({ lang, days, start, grace }: { lang: Lang; days: Day[]; start: number; grace: number }) {
  const w = t(lang), { tip, show, hide } = useTip();
  const W = 360, H = 170, pad = { l: 40, r: 8, t: 10, b: 24 }, lo = 6 * 60, hi = 13 * 60;
  const mod = (instant: number) => { const [h, m] = clock('en', instant).split(':').map(Number); return h * 60 + m; };
  const pts = days.map((d, i) => ({ d, i, m: d.firstIn && !d.missingIn ? mod(d.firstIn) : null })).filter(p => p.m !== null) as { d: Day; i: number; m: number }[];
  const x = (i: number) => pad.l + (i + 0.5) * ((W - pad.l - pad.r) / Math.max(days.length, 1));
  const y = (m: number) => pad.t + (H - pad.t - pad.b) * ((Math.min(Math.max(m, lo), hi) - lo) / (hi - lo));
  return <div className="chart" dir="ltr">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={w.arrivals}>
      {[7, 9, 11, 13].map(h => <g key={h}><line className="grid" x1={pad.l} x2={W - pad.r} y1={y(h * 60)} y2={y(h * 60)} /><text className="axis" x={pad.l - 6} y={y(h * 60) + 4} textAnchor="end">{String(h).padStart(2, '0')}:00</text></g>)}
      <line className="ref" x1={pad.l} x2={W - pad.r} y1={y(start + grace)} y2={y(start + grace)} />
      {pts.map(p => <g key={p.d.date} onPointerMove={e => show(e, <DayTip lang={lang} day={p.d} />)} onPointerLeave={hide}><circle className="hit" cx={x(p.i)} cy={y(p.m)} r={12} /><circle cx={x(p.i)} cy={y(p.m)} r={4.5} fill={p.m > start + grace ? STATUS.warning : STATUS.good} stroke="#151b2c" strokeWidth={2} /></g>)}
      {!pts.length && <text className="axis" x={W / 2} y={H / 2} textAnchor="middle">{w.noData}</text>}
    </svg>
    <Tip tip={tip} />
  </div>;
}

/* ---------- day timeline (employee) ---------- */
export function DayTimeline({ lang, days }: { lang: Lang; days: Day[] }) {
  const w = t(lang), { tip, show, hide } = useTip();
  const lo = 6 * 60, hi = 22 * 60;
  const mod = (instant: number) => { const [h, m] = clock('en', instant).split(':').map(Number); return h * 60 + m; };
  const pct = (m: number) => `${((Math.min(Math.max(m, lo), hi) - lo) / (hi - lo)) * 100}%`;
  const rows = days.filter(d => d.taps.length || d.status === 'red').slice(-10).reverse();
  return <div className="timeline" dir="ltr">
    <div className="tl-axis"><span />{[6, 9, 12, 15, 18, 21].map(h => <b key={h} style={{ left: pct(h * 60) }}>{String(h).padStart(2, '0')}:00</b>)}</div>
    {rows.map(d => {
      const segs: { a: number; b: number }[] = []; let open: number | null = null;
      for (const tap of d.taps) { if (tap.direction === 'in') { if (open === null) open = mod(tap.at); } else if (open !== null) { segs.push({ a: open, b: mod(tap.at) }); open = null; } }
      if (open !== null && d.inside) segs.push({ a: open, b: mod(Date.now()) });
      return <div key={d.date} className="tl-row" onPointerMove={e => show(e, <DayTip lang={lang} day={d} />)} onPointerLeave={hide}>
        <span className="tl-date"><i style={{ background: statusColor(d.status) }} />{shortDate(lang, d.date)}</span>
        <div className="tl-track">{[9, 12, 15, 18].map(h => <em key={h} style={{ left: pct(h * 60) }} />)}
          {segs.map((s, i) => <span key={i} className="tl-seg" style={{ left: pct(s.a), width: `calc(${pct(s.b)} - ${pct(s.a)})` }} />)}
          {d.taps.map(tap => <span key={tap.at} className={`tl-tap ${tap.direction}`} style={{ left: pct(mod(tap.at)) }} />)}
          {!d.taps.length && <span className="tl-absent">{w.absent}</span>}
        </div>
        <span className="tl-hours">{duration(lang, d.minutes)}</span>
      </div>;
    })}
    {!rows.length && <p className="muted">{w.noData}</p>}
    <Tip tip={tip} />
  </div>;
}

/* ---------- doors list ---------- */
export function DoorList({ lang, doors }: { lang: Lang; doors: { door: string; count: number }[] }) {
  const w = t(lang), total = doors.reduce((s, d) => s + d.count, 0) || 1;
  return <ul className="doors">{doors.map(d => { const share = d.count / total; return <li key={d.door}>
    <svg viewBox="0 0 36 36" className="mini-ring" aria-hidden="true"><circle cx="18" cy="18" r="15" className="track" /><circle cx="18" cy="18" r="15" className="arc" strokeDasharray={`${share * 94.2} 94.2`} /></svg>
    <span><b>{d.door}</b><small>{d.count} {w.taps}</small></span><strong>{Math.round(share * 100)}%</strong>
  </li>; })}{!doors.length && <li className="muted">{w.noData}</li>}</ul>;
}

/* ---------- ring for the hero tile ---------- */
export function Ring({ value, total, size = 120 }: { value: number; total: number; size?: number }) {
  const r = 46, c = 2 * Math.PI * r, share = total ? value / total : 0;
  return <svg viewBox="0 0 108 108" width={size} height={size} className="ring" aria-hidden="true"><circle cx="54" cy="54" r={r} className="track" /><circle cx="54" cy="54" r={r} className="arc" strokeDasharray={`${share * c} ${c}`} transform="rotate(-90 54 54)" /></svg>;
}
