import type { Config } from './config.js';
import type { Store } from './store.js';

// Work rules HR/admins edit in the dashboard. Stored in the settings table; config values are the defaults.
export interface WorkRules { workStartMinutes: number; lateGraceMinutes: number; requiredMinutes: number; weekendDays: number[] }

export function getRules(store: Store, config: Config): WorkRules {
  const raw = store.setting('workRules');
  const defaults: WorkRules = { workStartMinutes: config.WORK_START_MINUTES, lateGraceMinutes: config.LATE_GRACE_MINUTES, requiredMinutes: config.REQUIRED_MINUTES, weekendDays: config.WEEKEND_DAYS };
  if (!raw) return defaults;
  try { return { ...defaults, ...validateRules(JSON.parse(raw)) }; } catch { return defaults; }
}

/** Throws with a readable message when a value is out of range. */
export function validateRules(input: unknown): WorkRules {
  const r = input as Partial<WorkRules>;
  const int = (v: unknown, min: number, max: number, name: string) => { if (!Number.isInteger(v) || (v as number) < min || (v as number) > max) throw new Error(`${name} must be a whole number between ${min} and ${max}`); return v as number; };
  const workStartMinutes = int(r.workStartMinutes, 0, 23 * 60 + 59, 'Work start');
  const lateGraceMinutes = int(r.lateGraceMinutes, 0, 240, 'Grace');
  const requiredMinutes = int(r.requiredMinutes, 60, 16 * 60, 'Required time');
  if (!Array.isArray(r.weekendDays)) throw new Error('Weekend days must be a list');
  const weekendDays = [...new Set(r.weekendDays.map(d => int(d, 0, 6, 'Weekend day')))].sort();
  if (weekendDays.length > 3) throw new Error('At most three weekend days');
  return { workStartMinutes, lateGraceMinutes, requiredMinutes, weekendDays };
}

export function saveRules(store: Store, input: unknown): WorkRules {
  const rules = validateRules(input);
  store.set('workRules', JSON.stringify(rules));
  return rules;
}

// Days off (Eid, National Day, a building closure, a team offsite). One entry can cover several days,
// and applies to the whole company when `departments` is empty, otherwise only to those departments.
export interface Holiday { id: string; name: string; from: string; to: string; departments: string[] }
const DAY = 86_400_000;
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T12:00:00Z`).toISOString().startsWith(v);

export function getHolidays(store: Store): Holiday[] {
  try { return validateHolidays(JSON.parse(store.setting('holidays') || '[]')); } catch { return []; }
}

/** Throws with a readable message when an entry is invalid. Sorted by start date. */
export function validateHolidays(input: unknown): Holiday[] {
  if (!Array.isArray(input)) throw new Error('Holidays must be a list');
  if (input.length > 200) throw new Error('At most 200 holidays');
  const ids = new Set<string>();
  return input.map((h: Partial<Holiday>) => {
    const name = typeof h?.name === 'string' ? h.name.trim() : '';
    if (!name || name.length > 80) throw new Error('Each holiday needs a name of up to 80 characters');
    if (!isDate(h.from) || !isDate(h.to ?? h.from)) throw new Error(`${name}: dates must be YYYY-MM-DD`);
    const from = h.from, to = h.to ?? h.from;
    if (to < from) throw new Error(`${name}: the last day is before the first day`);
    if ((Date.parse(to) - Date.parse(from)) / DAY >= 31) throw new Error(`${name}: one holiday can cover at most 31 days`);
    const raw = h.departments ?? [];
    if (!Array.isArray(raw) || raw.length > 50 || raw.some(d => typeof d !== 'string' || !d.trim() || d.length > 100)) throw new Error(`${name}: departments must be a list of department names`);
    const departments = [...new Set(raw.map(d => d.trim()))].sort();
    let id = typeof h.id === 'string' && /^[\w-]{1,40}$/.test(h.id) ? h.id : `${from}-${name.toLowerCase().replace(/[^\w]+/g, '-').slice(0, 20)}`;
    while (ids.has(id)) id += '-2';
    ids.add(id);
    return { id, name, from, to, departments };
  }).sort((a, b) => a.from.localeCompare(b.from) || a.name.localeCompare(b.name));
}

export function saveHolidays(store: Store, input: unknown): Holiday[] {
  const holidays = validateHolidays(input);
  store.set('holidays', JSON.stringify(holidays));
  return holidays;
}

/** Holiday dates mapped to their names: company-wide, and per department. Overlapping entries keep the first name. */
export function holidayDates(holidays: Holiday[]) {
  const company: Record<string, string> = {}, departments: Record<string, Record<string, string>> = {};
  for (const h of holidays) for (let t = Date.parse(`${h.from}T12:00:00Z`); t <= Date.parse(`${h.to}T12:00:00Z`); t += DAY) {
    const date = new Date(t).toISOString().slice(0, 10);
    if (!h.departments.length) company[date] ??= h.name;
    else for (const d of h.departments) (departments[d] ??= {})[date] ??= h.name;
  }
  return { company, departments };
}

/** The config the attendance engine uses, with the dashboard rules and holidays applied. */
export const withRules = (config: Config, rules: WorkRules, holidays: Holiday[] = []): Config => {
  const { company, departments } = holidayDates(holidays);
  return { ...config, WORK_START_MINUTES: rules.workStartMinutes, LATE_GRACE_MINUTES: rules.lateGraceMinutes, REQUIRED_MINUTES: rules.requiredMinutes, WEEKEND_DAYS: rules.weekendDays, HOLIDAYS: company, DEPARTMENT_HOLIDAYS: departments };
};
