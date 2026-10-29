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

/** The config the attendance engine uses, with the dashboard rules applied. */
export const withRules = (config: Config, rules: WorkRules): Config => ({ ...config, WORK_START_MINUTES: rules.workStartMinutes, LATE_GRACE_MINUTES: rules.lateGraceMinutes, REQUIRED_MINUTES: rules.requiredMinutes, WEEKEND_DAYS: rules.weekendDays });
