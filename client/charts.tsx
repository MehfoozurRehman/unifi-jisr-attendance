import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { clock, duration, longDate, minuteClock, monthShort, shortDate, t, weekdayShort, type Lang } from './i18n';

// Validated on the dark panel: status steps from the reference status palette, a one-hue sand ramp for magnitude,
// and a categorical blue for time spent outside.
export const STATUS = { good: '#0ca30c', warning: '#fab219', critical: '#d03b3b' } as const;
export const OUTSIDE = '#3987e5';
const RAMP = ['#615248', '#86705f', '#ac917e', '#d1b4a2', '#efdccf'];
const EMPTY = '#1d2335';
export const rampColor = (value: number, max: number) => value <= 0 || max <= 0 ? EMPTY : RAMP[Math.min(RAMP.length - 1, Math.floor((value / max) * RAMP.length))];

export type Wave = { median: number | null; count: number };
export type DailyPoint = { date: string; workday: boolean; tracked: boolean; present: number; onTime: number; late: number; absent: number; minutes: number; averageMinutes: number; outsideMinutes: number; breaks: number; waves: { arrival: Wave & { first: { name: string; at: number }[] }; breakOut: Wave; departure: Wave } };
export type Tap = { at: number; direction: 'in' | 'out' };
export type Day = { date: string; weekday: number; workday: boolean; status: string; firstIn: number | null; lastOut: number | null; minutes: number; late: boolean; short: boolean; missingOut: boolean; missingIn: boolean; inside: boolean; taps: Tap[]; breaks: number; outsideMinutes: number; lateMinutes: number; overtimeMinutes: number };

/* ---------- sizing: every chart fills its card ---------- */
function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null); const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const update = () => { const r = el.getBoundingClientRect(); setSize(s => (Math.abs(s.w - r.width) < 1 && Math.abs(s.h - r.height) < 1 ? s : { w: Math.floor(r.width), h: Math.floor(r.height) })); };
    update(); const observer = new ResizeObserver(update); observer.observe(el); return () => observer.disconnect();
  }, []);
  return { ref, ...size };
}
/** Fills the remaining space of its card; children receive the measured width and height. */
export function Fit({ minHeight, className = '', children }: { minHeight: number; className?: string; children: (w: number, h: number) => React.ReactNode }) {
  const { ref, w, h } = useSize<HTMLDivElement>();
  return <div ref={ref} className={`fit ${className}`} style={{ minBlockSize: minHeight }} dir="ltr">{w > 0 && children(w, Math.max(h, minHeight))}</div>;
}

/* ---------- tooltip ---------- */
type TipState = { x: number; y: number; content: React.ReactNode } | null;
export function useTip() {
  const [tip, setTip] = useState<TipState>(null);
  const show = (event: React.PointerEvent | React.FocusEvent, content: React.ReactNode) => {
    const at = 'clientX' in event ? { x: event.clientX, y: event.clientY } : (() => { const r = (event.target as Element).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top }; })();
    setTip({ ...at, content });
  };
  return { tip, show, hide: () => setTip(null) };
}
export function Tip({ tip }: { tip: TipState }) {
  if (!tip) return null;
  return <div className="tip" role="tooltip" style={{ left: Math.min(Math.max(tip.x + 14, 8), window.innerWidth - 250), top: Math.max(tip.y - 12, 8) }}>{tip.content}</div>;
}
const Row = ({ color, label, value }: { color?: string; label: string; value: React.ReactNode }) => <div className="tip-row">{color && <i style={{ background: color }} />}<b>{value}</b><span>{label}</span></div>;
export const Legend = ({ items }: { items: [string, string][] }) => <div className="legend">{items.map(([c, l]) => <span key={l}><i style={{ background: c }} />{l}</span>)}</div>;

/* ---------- daily attendance, stacked (company / department) ---------- */
export function DailyAttendance({ lang, data }: { lang: Lang; data: DailyPoint[] }) {
  const w = t(lang), { tip, show, hide } = useTip();
  return <>
    <Fit minHeight={200}>{(W, H) => {
      const pad = { l: 30, r: 4, t: 8, b: 24 };
      const max = Math.max(1, ...data.map(d => d.onTime + d.late + d.absent));
      const step = (W - pad.l - pad.r) / Math.max(data.length, 1), bar = Math.max(3, Math.min(48, step * 0.56));
      const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
      const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(W / 70))));
      return <svg width={W} height={H} role="img" aria-label={w.dailyAttendance}>
        {[0, Math.round(max / 2), max].map(v => <g key={v}><line className="grid" x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} /><text className="axis" x={pad.l - 8} y={y(v) + 4} textAnchor="end">{v}</text></g>)}
        {data.map((d, i) => {
          const x = pad.l + i * step + (step - bar) / 2; let acc = 0;
          return <g key={d.date} onPointerMove={e => show(e, <><strong>{longDate(lang, d.date)}</strong><Row color={STATUS.good} label={w.onTime} value={d.onTime} /><Row color={STATUS.warning} label={w.late} value={d.late} /><Row color={STATUS.critical} label={w.absent} value={d.absent} /><Row label={w.averageDay} value={duration(lang, d.averageMinutes)} /></>)} onPointerLeave={hide}>
            <rect className="hit" x={pad.l + i * step} y={pad.t} width={step} height={H - pad.t - pad.b} />
            {!d.tracked && <rect className="untracked" x={x} y={H - pad.b - 3} width={bar} height={3} rx={1.5} />}
            {[{ v: d.onTime, c: STATUS.good }, { v: d.late, c: STATUS.warning }, { v: d.absent, c: STATUS.critical }].map((p, j) => { if (!p.v) return null; const top = y(acc + p.v), h = y(acc) - top - (acc ? 2 : 0); acc += p.v; return <rect key={j} x={x} y={top} width={bar} height={Math.max(h, 1)} rx={Math.min(5, bar / 2)} fill={p.c} />; })}
            {i % labelEvery === 0 && <text className="axis" x={x + bar / 2} y={H - 6} textAnchor="middle">{shortDate(lang, d.date)}</text>}
          </g>;
        })}
      </svg>;
    }}</Fit>
    <Legend items={[[STATUS.good, w.onTime], [STATUS.warning, w.late], [STATUS.critical, w.absent]]} />
    <Tip tip={tip} />
  </>;
}

/* ---------- GitHub-style year grid: cells grow to fill the width ---------- */
export function YearGrid({ lang, days, perPerson }: { lang: Lang; days: { date: string; minutes: number; present: number; tracked: boolean; workday: boolean }[]; perPerson?: boolean }) {
  const w = t(lang), { tip, show, hide } = useTip();
  const max = Math.max(1, ...days.map(d => d.minutes)), weeks = Math.ceil(days.length / 7);
  return <>
    <Fit minHeight={120}>{W => {
      const left = 46, top = 18, gap = 3;
      const cell = Math.max(9, Math.min(22, Math.floor((W - left) / weeks) - gap));
      const H = top + 7 * (cell + gap);
      return <svg width={W} height={H} role="img" aria-label={w.yearActivity} className="year">
        {[1, 3, 5].map(r => <text key={r} className="axis" x={left - 8} y={top + r * (cell + gap) + cell - 2} textAnchor="end">{weekdayShort(lang, r)}</text>)}
        {days.map((d, i) => {
          const col = Math.floor(i / 7), row = i % 7, x = left + col * (cell + gap), y = top + row * (cell + gap);
          return <g key={d.date}>
            {row === 0 && Number(d.date.slice(8)) <= 7 && <text className="axis" x={x} y={11}>{monthShort(lang, d.date)}</text>}
            <rect className={`cell${d.tracked ? '' : ' off'}`} x={x} y={y} width={cell} height={cell} rx={Math.max(2, cell / 4)} fill={d.tracked ? rampColor(d.minutes, max) : 'transparent'}
              onPointerMove={e => show(e, <><strong>{longDate(lang, d.date)}</strong>{d.tracked ? <><Row label={w.hoursAxis} value={duration(lang, d.minutes)} />{!perPerson && <Row label={w.present} value={d.present} />}</> : <span className="muted">{w.beforeRecording}</span>}</>)} onPointerLeave={hide} />
          </g>;
        })}
      </svg>;
    }}</Fit>
    <div className="ramp-legend"><span>{w.less}</span>{[EMPTY, ...RAMP].map(c => <i key={c} style={{ background: c }} />)}<span>{w.more}</span></div>
    <Tip tip={tip} />
  </>;
}

/* ---------- work activity (concept): weekday x hour, hatched when quiet ---------- */
export function WorkActivity({ lang, matrix, fromHour = 7, toHour = 18 }: { lang: Lang; matrix: number[][]; fromHour?: number; toHour?: number }) {
  const w = t(lang), { tip, show, hide } = useTip();
  const hours = Array.from({ length: toHour - fromHour + 1 }, (_, i) => fromHour + i);
  const max = Math.max(0.0001, ...matrix.flat());
  const level = (v: number) => v <= 0 ? 'none' : v / max < 0.34 ? 'low' : v / max < 0.67 ? 'mid' : 'high';
  return <div className="activity" dir="ltr">
    <div className="activity-legend">{(['none', 'low', 'mid', 'high'] as const).map(l => <span key={l}><i className={`act ${l}`} />{w.activityLevels[l]}</span>)}</div>
    <div className="activity-grid" style={{ gridTemplateRows: `repeat(${hours.length}, minmax(14px, 1fr)) auto` }}>
      {hours.map(h => <React.Fragment key={h}>
        <span className="axis">{String(h).padStart(2, '0')}:00</span>
        {Array.from({ length: 7 }, (_, d) => { const v = matrix[d]?.[h] ?? 0; return <i key={d} className={`act ${level(v)}`} onPointerMove={e => show(e, <><strong>{weekdayShort(lang, d)} · {String(h).padStart(2, '0')}:00</strong><Row label={w.peopleInside} value={v} /></>)} onPointerLeave={hide} />; })}
      </React.Fragment>)}
      <span />{Array.from({ length: 7 }, (_, d) => <span key={d} className="axis center">{weekdayShort(lang, d)}</span>)}
    </div>
    <Tip tip={tip} />
  </div>;
}

/* ---------- concentric rings (concept "Working format") ---------- */
export function Rings({ center, centerLabel, parts }: { center: string; centerLabel: string; parts: { label: string; value: number; color: string }[] }) {
  const radii = [88, 70, 52];
  return <div className="rings">
    <Fit minHeight={190} className="rings-fit">{(W, H) => {
      const size = Math.min(W, H);
      return <svg width={size} height={size} viewBox="0 0 200 200" role="img" aria-label={parts.map(p => `${p.label} ${Math.round(p.value * 100)}%`).join(', ')} style={{ marginInline: 'auto', display: 'block' }}>
        {parts.slice(0, 3).map((p, i) => { const r = radii[i], c = 2 * Math.PI * r; return <g key={p.label} transform="rotate(-90 100 100)">
          <circle cx="100" cy="100" r={r} className="ring-track" strokeWidth={i === 0 ? 12 : 9} />
          <circle cx="100" cy="100" r={r} fill="none" stroke={p.color} strokeWidth={i === 0 ? 12 : 9} strokeLinecap="round" strokeDasharray={`${Math.max(0.001, p.value) * c} ${c}`} />
        </g>; })}
        <text x="100" y="104" textAnchor="middle" className="ring-big">{center}</text>
        <text x="100" y="124" textAnchor="middle" className="ring-sub">{centerLabel}</text>
      </svg>;
    }}</Fit>
    <div className="ring-legend">{parts.map(p => <span key={p.label}><b><i style={{ background: p.color }} />{Math.round(p.value * 100)}%</b><small>{p.label}</small></span>)}</div>
  </div>;
}

/* ---------- live inside timer (concept "Time tracking") ---------- */
function useNow(ms = 1000) { const [now, setNow] = useState(Date.now()); useEffect(() => { const id = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(id); }, [ms]); return now; }
const hms = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
export type LiveRow = { key: string; name: string; sub: string; minutesAtFetch: number; inside: boolean; onClick?: () => void };
export function LiveTimer({ lang, title, rows, fetchedAt, emptyLabel }: { lang: Lang; title: string; rows: LiveRow[]; fetchedAt: number; emptyLabel: string }) {
  const w = t(lang), now = useNow();
  const elapsed = (r: LiveRow) => r.minutesAtFetch * 60_000 + (r.inside ? now - fetchedAt : 0);
  const [top, ...rest] = rows;
  return <div className="live">
    <div className="live-head"><h3>{title}</h3></div>
    {top ? <button className="live-hero" onClick={top.onClick}>
      <span><small>{top.name}</small><strong>{hms(elapsed(top))}</strong></span>
      <i className={top.inside ? 'pulse' : 'paused'} aria-label={top.inside ? w.inside : w.left}>{top.inside ? <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg> : <svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zm6 0h4v14h-4z" /></svg>}</i>
    </button> : <div className="live-hero empty">{emptyLabel}</div>}
    <ul className="live-list">{rest.slice(0, 3).map(r => <li key={r.key}><button onClick={r.onClick}><span className="avatar sm">{/^\d/.test(r.name) ? '◷' : r.name.split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase()}</span><span><b>{r.name}</b><small>{r.sub} · {hms(elapsed(r)).slice(0, 5)}</small></span></button></li>)}</ul>
  </div>;
}

/* ---------- week board (concept "Tasks overview") ---------- */
export type BoardCard = { day: number; start: number; end: number; title: string; sub: string; tone: 'sand' | 'dark' | 'outside'; avatars?: string[] };
export function WeekBoard({ lang, days, today, cards, fromHour = 7, toHour = 19 }: { lang: Lang; days: string[]; today: string; cards: BoardCard[]; fromHour?: number; toHour?: number }) {
  const hours = Array.from({ length: toHour - fromHour + 1 }, (_, i) => fromHour + i);
  const span = (toHour - fromHour) * 60;
  const pct = (m: number) => `${((Math.min(Math.max(m, fromHour * 60), toHour * 60) - fromHour * 60) / span) * 100}%`;
  const todayIndex = days.indexOf(today);
  return <div className="board" dir="ltr">
    <div className="board-days"><span />{days.map((d, i) => <span key={d} className={i === todayIndex ? 'on' : ''}><small>{weekdayShort(lang, new Date(`${d}T12:00:00Z`).getUTCDay())}</small><b>{Number(d.slice(8))}</b></span>)}</div>
    <div className="board-body">
      <div className="board-hours">{hours.map(h => <span key={h} style={{ top: pct(h * 60) }}>{String(h).padStart(2, '0')}:00</span>)}</div>
      <div className="board-cols">
        {days.map((d, i) => <div key={d} className={`board-col${i === todayIndex ? ' on' : ''}`} />)}
        {hours.map(h => <em key={h} className="board-line" style={{ top: pct(h * 60) }} />)}
        {cards.map((c, i) => <div key={i} className={`board-card ${c.tone}`} style={{ top: pct(c.start), height: `max(44px, calc(${pct(c.end)} - ${pct(c.start)}))`, left: `calc(${(c.day / days.length) * 100}% + 4px)`, width: `calc(${100 / days.length}% - 8px)` }}>
          <b>{c.title}</b><small>{c.sub}</small>
          {c.avatars && c.day === todayIndex && <span className="avatars">{c.avatars.slice(0, 3).map(a => <i key={a}>{a.split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase()}</i>)}</span>}
        </div>)}
      </div>
    </div>
  </div>;
}

/* ---------- time-of-day histogram ---------- */
export function TimeHistogram({ lang, bins, title, marker }: { lang: Lang; bins: { start: number; count: number }[]; title: string; marker?: number }) {
  const w = t(lang), { tip, show, hide } = useTip();
  return <>
    <Fit minHeight={170}>{(W, H) => {
      const pad = { l: 6, r: 6, t: 18, b: 22 };
      const max = Math.max(1, ...bins.map(b => b.count)), step = (W - pad.l - pad.r) / bins.length, bar = Math.max(3, step * 0.66);
      const first = bins[0]?.start ?? 0, span = bins.length * 30, xOf = (m: number) => pad.l + ((m - first) / span) * (W - pad.l - pad.r);
      return <svg width={W} height={H} role="img" aria-label={title}>
        <line className="grid" x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} />
        {bins.map((b, i) => { const h = ((H - pad.t - pad.b) * b.count) / max; return <g key={b.start} onPointerMove={e => show(e, <><strong>{minuteClock(b.start)}–{minuteClock(b.start + 30)}</strong><Row label={w.count} value={b.count} /></>)} onPointerLeave={hide}>
          <rect className="hit" x={pad.l + i * step} y={pad.t} width={step} height={H - pad.t - pad.b} />
          {b.count > 0 && <rect x={pad.l + i * step + (step - bar) / 2} y={H - pad.b - h} width={bar} height={h} rx={Math.min(5, bar / 2)} fill={RAMP[3]} />}
          {b.start % 60 === 0 && <text className="axis" x={pad.l + i * step + step / 2} y={H - 6} textAnchor="middle">{minuteClock(b.start).slice(0, 2)}</text>}
        </g>; })}
        {marker !== undefined && marker >= first && marker <= first + span && <g><line className="ref" x1={xOf(marker)} x2={xOf(marker)} y1={pad.t} y2={H - pad.b} /><text className="axis ref-label" x={xOf(marker)} y={pad.t - 6} textAnchor="middle">{minuteClock(marker)}</text></g>}
      </svg>;
    }}</Fit>
    <Tip tip={tip} />
  </>;
}

/* ---------- per-day inside / outside (employee) ---------- */
const statusColor = (s: string) => s === 'green' ? STATUS.good : s === 'yellow' ? STATUS.warning : s === 'red' ? STATUS.critical : s === 'today' ? RAMP[3] : 'transparent';
export function DailyHours({ lang, days, required }: { lang: Lang; days: Day[]; required: number }) {
  const w = t(lang), { tip, show, hide } = useTip();
  return <>
    <Fit minHeight={200}>{(W, H) => {
      const pad = { l: 30, r: 4, t: 8, b: 24 };
      const max = Math.max(required * 1.25, ...days.map(d => d.minutes + d.outsideMinutes));
      const step = (W - pad.l - pad.r) / Math.max(days.length, 1), bar = Math.max(3, Math.min(48, step * 0.56));
      const y = (m: number) => pad.t + (H - pad.t - pad.b) * (1 - m / max);
      const labelEvery = Math.max(1, Math.ceil(days.length / Math.max(2, Math.floor(W / 70))));
      return <svg width={W} height={H} role="img" aria-label={w.dailyHours}>
        {[0, 4 * 60, 8 * 60, 12 * 60].filter(v => v <= max).map(v => <g key={v}><line className="grid" x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} /><text className="axis" x={pad.l - 8} y={y(v) + 4} textAnchor="end">{v / 60}{w.h}</text></g>)}
        <line className="ref" x1={pad.l} x2={W - pad.r} y1={y(required)} y2={y(required)} />
        {days.map((d, i) => { const x = pad.l + i * step + (step - bar) / 2; return <g key={d.date} onPointerMove={e => show(e, <DayTip lang={lang} day={d} />)} onPointerLeave={hide}>
          <rect className="hit" x={pad.l + i * step} y={pad.t} width={step} height={H - pad.t - pad.b} />
          {d.status === 'red' && !d.taps.length && <rect x={x} y={H - pad.b - 3} width={bar} height={3} rx={1.5} fill={STATUS.critical} />}
          {d.minutes > 0 && <rect x={x} y={y(d.minutes)} width={bar} height={H - pad.b - y(d.minutes)} rx={Math.min(5, bar / 2)} fill={statusColor(d.status)} />}
          {d.outsideMinutes > 0 && <rect x={x} y={y(d.minutes + d.outsideMinutes)} width={bar} height={Math.max(1, y(d.minutes) - y(d.minutes + d.outsideMinutes) - 2)} rx={Math.min(5, bar / 2)} fill={OUTSIDE} />}
          {i % labelEvery === 0 && <text className="axis" x={x + bar / 2} y={H - 6} textAnchor="middle">{shortDate(lang, d.date)}</text>}
        </g>; })}
      </svg>;
    }}</Fit>
    <Legend items={[[STATUS.good, w.onTime], [STATUS.warning, w.late], [STATUS.critical, w.absent], [RAMP[3], w.today], [OUTSIDE, w.outside]]} />
    <Tip tip={tip} />
  </>;
}
export function DayTip({ lang, day }: { lang: Lang; day: Day }) {
  const w = t(lang);
  const label = day.status === 'green' ? w.onTime : day.status === 'yellow' ? w.late : day.status === 'red' ? w.absent : day.status === 'off' ? w.weekend : day.status === 'untracked' ? w.beforeRecording : w.today;
  return <><strong>{longDate(lang, day.date)}</strong><Row color={statusColor(day.status) === 'transparent' ? undefined : statusColor(day.status)} label={w.status} value={label} /><Row label={w.insideTime} value={duration(lang, day.minutes)} />{day.outsideMinutes > 0 && <Row color={OUTSIDE} label={`${w.outside} · ${day.breaks} ${w.breaks}`} value={duration(lang, day.outsideMinutes)} />}<Row label={w.firstIn} value={clock(lang, day.firstIn)} /><Row label={w.lastOut} value={day.inside ? w.inside : clock(lang, day.lastOut)} />{day.missingIn && <span className="muted">{w.exitNoEntry}</span>}{day.missingOut && <span className="muted">{w.noExit}</span>}</>;
}

/* ---------- arrival time per day (employee) ---------- */
export function ArrivalDots({ lang, days, start, grace }: { lang: Lang; days: Day[]; start: number; grace: number }) {
  const w = t(lang), { tip, show, hide } = useTip();
  const mod = (instant: number) => { const [h, m] = clock('en', instant).split(':').map(Number); return h * 60 + m; };
  const pts = days.map((d, i) => ({ d, i, m: d.firstIn && !d.missingIn ? mod(d.firstIn) : null })).filter(p => p.m !== null) as { d: Day; i: number; m: number }[];
  return <>
    <Fit minHeight={170}>{(W, H) => {
      const pad = { l: 42, r: 6, t: 10, b: 12 }, lo = 6 * 60, hi = 13 * 60;
      const x = (i: number) => pad.l + (i + 0.5) * ((W - pad.l - pad.r) / Math.max(days.length, 1));
      const y = (m: number) => pad.t + (H - pad.t - pad.b) * ((Math.min(Math.max(m, lo), hi) - lo) / (hi - lo));
      return <svg width={W} height={H} role="img" aria-label={w.arrivals}>
        {[7, 9, 11, 13].map(h => <g key={h}><line className="grid" x1={pad.l} x2={W - pad.r} y1={y(h * 60)} y2={y(h * 60)} /><text className="axis" x={pad.l - 6} y={y(h * 60) + 4} textAnchor="end">{String(h).padStart(2, '0')}:00</text></g>)}
        <line className="ref" x1={pad.l} x2={W - pad.r} y1={y(start + grace)} y2={y(start + grace)} />
        {pts.map(p => <g key={p.d.date} onPointerMove={e => show(e, <DayTip lang={lang} day={p.d} />)} onPointerLeave={hide}><circle className="hit" cx={x(p.i)} cy={y(p.m)} r={12} /><circle cx={x(p.i)} cy={y(p.m)} r={5} fill={p.m > start + grace ? STATUS.warning : STATUS.good} stroke="var(--card)" strokeWidth={2} /></g>)}
        {!pts.length && <text className="axis" x={W / 2} y={H / 2} textAnchor="middle">{w.noData}</text>}
      </svg>;
    }}</Fit>
    <Tip tip={tip} />
  </>;
}

/* ---------- day timeline (employee) ---------- */
export function DayTimeline({ lang, days }: { lang: Lang; days: Day[] }) {
  const w = t(lang), { tip, show, hide } = useTip();
  const lo = 6 * 60, hi = 22 * 60;
  const mod = (instant: number) => { const [h, m] = clock('en', instant).split(':').map(Number); return h * 60 + m; };
  const pct = (m: number) => `${((Math.min(Math.max(m, lo), hi) - lo) / (hi - lo)) * 100}%`;
  const rows = days.filter(d => d.taps.length || d.status === 'red').slice(-10).reverse();
  return <div className="timeline" dir="ltr">
    <div className="tl-axis">{[6, 9, 12, 15, 18, 21].map(h => <b key={h} style={{ left: pct(h * 60) }}>{String(h).padStart(2, '0')}:00</b>)}</div>
    {rows.map(d => {
      const segs: { a: number; b: number }[] = []; let open: number | null = null;
      for (const tap of d.taps) { if (tap.direction === 'in') { if (open === null) open = mod(tap.at); } else if (open !== null) { segs.push({ a: open, b: mod(tap.at) }); open = null; } }
      if (open !== null && d.inside) segs.push({ a: open, b: mod(Date.now()) });
      return <div key={d.date} className="tl-row" onPointerMove={e => show(e, <DayTip lang={lang} day={d} />)} onPointerLeave={hide}>
        <span className="tl-date"><i style={{ background: statusColor(d.status) }} />{shortDate(lang, d.date)}</span>
        <div className="tl-track">{[9, 12, 15, 18].map(h => <em key={h} style={{ left: pct(h * 60) }} />)}
          {segs.map((s, i) => <span key={i} className="tl-seg" style={{ left: pct(s.a), width: `calc(${pct(s.b)} - ${pct(s.a)})` }} />)}
          {!d.taps.length && <span className="tl-absent">{w.absent}</span>}</div>
        <span className="tl-hours">{duration(lang, d.minutes)}</span>
      </div>;
    })}
    {!rows.length && <p className="muted">{w.noData}</p>}
    <Tip tip={tip} />
  </div>;
}

/* ---------- doors (concept "Apps & URLs") ---------- */
export function DoorList({ lang, doors }: { lang: Lang; doors: { door: string; count: number }[] }) {
  const w = t(lang), total = doors.reduce((s, d) => s + d.count, 0) || 1;
  return <ul className="doors">{doors.map(d => { const share = d.count / total; return <li key={d.door}>
    <span className="door-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 21V4a1 1 0 0 1 1-1h9l4 2v16h2v1H3v-1Zm9-2.6V5.3L7 4.5V19Zm-2-7.4a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" /></svg></span>
    <span className="door-name"><b>{d.door}</b><small>{d.count} {w.taps}</small></span>
    <span className="door-ring"><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" className="track" /><circle cx="20" cy="20" r="16" className="arc" strokeDasharray={`${share * 100.5} 100.5`} transform="rotate(-90 20 20)" /></svg><b>{Math.round(share * 100)}%</b></span>
  </li>; })}{!doors.length && <li className="muted">{w.noData}</li>}</ul>;
}

/* ---------- ranked horizontal bars (departments, leaderboards) ---------- */
export type RankItem = { key: string; label: string; sub?: string; value: number; display: string; onClick?: () => void };
export function RankBars({ items, max, tone = 'sand', empty }: { items: RankItem[]; max?: number; tone?: 'sand' | 'good' | 'warning' | 'outside'; empty: string }) {
  const top = max ?? Math.max(1e-9, ...items.map(i => i.value));
  const fill = tone === 'good' ? STATUS.good : tone === 'warning' ? STATUS.warning : tone === 'outside' ? OUTSIDE : RAMP[3];
  return <ol className="rank">{items.map((item, i) => <li key={item.key}>
    <button type="button" onClick={item.onClick} disabled={!item.onClick}>
      <span className="rank-n">{i + 1}</span>
      <span className="rank-label"><b>{item.label}</b>{item.sub && <small>{item.sub}</small>}</span>
      <span className="rank-bar"><i style={{ inlineSize: `${Math.max(2, (item.value / top) * 100)}%`, background: fill }} /></span>
      <strong>{item.display}</strong>
    </button>
  </li>)}{!items.length && <li className="muted">{empty}</li>}</ol>;
}
