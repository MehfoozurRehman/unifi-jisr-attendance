import { createHash } from 'node:crypto';
import type { Config } from './config.js';
import type { NormalizedEvent, Direction } from './domain.js';
type Obj = Record<string, unknown>;
const object = (v: unknown): Obj => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Obj : {};
const str = (...values: unknown[]): string | null => {
  for (const v of values) if ((typeof v === 'string' || typeof v === 'number') && String(v).trim() && !String(v).includes('{')) return String(v).trim();
  return null;
};
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable((value as Obj)[k])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
export const hash = (value: unknown) => createHash('sha256').update(stable(value)).digest('hex');

export function normalizePersonName(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, ' ');
}

export function parseTimestamp(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const text = String(value).trim();
  if (/^\d+(\.\d+)?$/.test(text)) {
    const n = Number(text);
    const ms = n >= 1e17 ? n / 1e6 : n >= 1e14 ? n / 1e3 : n >= 1e11 ? n : n * 1e3;
    return Number.isFinite(ms) && ms >= Date.UTC(2020, 0, 1) && ms < Date.UTC(2100, 0, 1) ? Math.floor(ms) : null;
  }
  const m = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/i);
  if (!m) return null;
  const [, y, month, day, h, min, s] = m;
  if (+month < 1 || +month > 12 || +day < 1 || +day > new Date(Date.UTC(+y, +month, 0)).getUTCDate() || +h > 23 || +min > 59 || +s > 59) return null;
  const ms = Date.parse(text);
  return Number.isFinite(ms) && ms >= Date.UTC(2020, 0, 1) && ms < Date.UTC(2100, 0, 1) ? ms : null;
}
export function splitEvents(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload.length ? payload : [payload];
  const root = object(payload);
  return Array.isArray(root.events) && root.events.length ? root.events : [payload];
}
export function normalize(raw: unknown, receivedAt: number, config: Config): NormalizedEvent {
  const e = object(raw), d = object(e.data), actor = object(e.actor), target = object(e.target);
  let custom: Obj = {};
  try { custom = object(typeof d.custom_content === 'string' ? JSON.parse(d.custom_content) : d.custom_content); } catch {}
  const times: [string, unknown][] = [['time', e.time], ['data.timestamp', d.timestamp], ['timestamp', e.timestamp]];
  const selected = times.find(([, v]) => v !== undefined && v !== null && v !== '');
  const occurredAt = selected ? parseTimestamp(selected[1]) : null;
  const explicit = str(e.direction, d.direction, custom.direction)?.toLowerCase();
  const readerId = str(d.reader_id, e.reader_id, object(e.device).id, e.device);
  const readerName = str(d.reader_name, e.reader_name, e.device_name, object(e.device).name);
  const door = str(d.door_name, e.location_name, e.door_name, target.name, target.display_name);
  let direction: Direction | null = null, directionSource: string | null = null;
  const dir = (s: string): Direction | null => /^(in|entry|entrance|check[-_ ]?in|enter|entered)$/i.test(s) ? 'in' : /^(out|exit|exited|check[-_ ]?out|leave)$/i.test(s) ? 'out' : null;
  if (explicit) { direction = dir(explicit); directionSource = 'explicit direction'; }
  else if (readerId && config.READER_DIRECTIONS[readerId]) { direction = config.READER_DIRECTIONS[readerId]; directionSource = 'reader mapping'; }
  else {
    for (const [source, text] of [['reader name', readerName], ['door name', door]]) {
      if (!text) continue;
      const isIn = /\b(in|entry|entrance|check-in|arrival)\b/i.test(text);
      const isOut = /\b(out|exit|departure|check-out|leave)\b/i.test(text);
      if (isIn || isOut) { direction = isIn !== isOut ? (isIn ? 'in' : 'out') : null; directionSource = source; break; }
    }
  }
  const result = str(d.result, e.result)?.toUpperCase();
  const alarmType = typeof e.id === 'string' && e.id.startsWith('access.') ? e.id : null;
  const type = str(e.event, d.event_type, e.event_type, e.type, alarmType)?.toLowerCase();
  const email = str(actor.email, d.user_email, e.user_email, custom.user_email)?.toLowerCase() ?? null;
  const userId = str(actor.id, d.user_id, e.user_id, e.user, custom.user_id);
  const name = str(actor.name, d.user_name, e.user_name, custom.user_name);
  const sourceId = str(e.event_id, d.event_id, alarmType ? null : e.id);
  const credential = str(e.credential_type, d.credential_type)?.toUpperCase();
  const physicalCredential = credential && ['NFC', 'FACE', 'PIN_CODE', 'WALLET_NFC_APPLE', 'WALLET_NFC_GOOGLE', 'MOBILE_TAP'].includes(credential);
  const alarmGranted = type === 'access.unlocks.location_unlocked' && physicalCredential && !str(e.admin) && !str(e.emergency_mode);
  let status: NormalizedEvent['status'] = 'queued', reason = 'Validated; waiting for employee matching';
  if (type && !['access.door.unlock', 'door.unlock', 'access.granted', 'access_granted', 'access.unlocks.location_unlocked'].includes(type)) { status = 'skipped'; reason = `Unsupported event type: ${type}`; }
  else if (credential && !physicalCredential) { status = 'skipped'; reason = `Remote or unsupported credential (${credential}); physical presence not established`; }
  else if (str(e.admin) || str(e.emergency_mode)) { status = 'skipped'; reason = 'Administrative or emergency unlock is not employee attendance'; }
  else if (result && !['ACCESS_GRANTED', 'SUCCESS', 'PASSED'].includes(result)) { status = 'skipped'; reason = `Access not granted: ${result}`; }
  else if (!result && !alarmGranted) { status = 'held'; reason = 'Missing access result; cannot establish successful access'; }
  else if (!occurredAt) { status = 'held'; reason = 'Missing, invalid, or timezone-free event timestamp'; }
  else if (occurredAt > receivedAt + config.MAX_FUTURE_SKEW_MS) { status = 'held'; reason = 'Event timestamp is in the future; check device clock'; }
  else if (receivedAt - occurredAt > config.MAX_EVENT_AGE_MS) { status = 'held'; reason = 'Event is older than automatic processing window'; }
  else if (!email && !name) { status = 'held'; reason = 'Employee email and full name are missing; manual identity required'; }
  else if (!direction) { status = 'held'; reason = 'Unknown or conflicting direction; no attendance action guessed'; }
  return {
    sourceId, occurredAt, timeSource: selected?.[0] ?? null, sourceTime: selected ? String(selected[1]) : null,
    userId, email, name, readerId, door, direction, directionSource, status, reason,
    fingerprint: hash(sourceId ? ['unifi', sourceId] : occurredAt && (email || userId || name) ? [occurredAt, userId || email || name, readerId || door, direction, result, type] : raw),
  };
}
