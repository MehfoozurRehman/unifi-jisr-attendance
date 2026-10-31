export const config = {
  PORT: Number(process.env.PORT ?? 3000),
  DATABASE_PATH: './data/attendance.sqlite',
  TIMEZONE: 'Asia/Riyadh',
  TIMEZONE_OFFSET: '+03:00',
  // Attendance day rules: green = on time and full hours, yellow = late or short, red = absent or no exit tap.
  WORK_START_MINUTES: Number(process.env.WORK_START_MINUTES ?? 9 * 60),
  LATE_GRACE_MINUTES: Number(process.env.LATE_GRACE_MINUTES ?? 15),
  REQUIRED_MINUTES: Number(process.env.REQUIRED_MINUTES ?? 8 * 60),
  WEEKEND_DAYS: [5, 6] as number[], // Friday, Saturday
  HOLIDAYS: {} as Record<string, string>, // company-wide days off, YYYY-MM-DD -> name; set in the dashboard
  DEPARTMENT_HOLIDAYS: {} as Record<string, Record<string, string>>, // department -> its own days off
  UNIFI_WEBHOOK_SECRET: process.env.UNIFI_WEBHOOK_SECRET || 'Unifi-secret-2026',
  UNIFI_BASE_URL: process.env.UNIFI_BASE_URL || 'https://192.168.8.1',
  UNIFI_API_TOKEN: process.env.UNIFI_API_TOKEN || '5wnFjU6RoXNMFnT9gx3b9K_QKVNlTubJ',
  UNIFI_IGNORE_SSL: process.env.UNIFI_IGNORE_SSL !== 'false',
  JISR_BASE_URL: process.env.JISR_BASE_URL || 'https://apis.jisr.net/api',
  JISR_SLUG: process.env.JISR_SLUG || 'zood',
  JISR_API_KEY: process.env.JISR_API_KEY || 'kbmnySRFFoiGJ_2zW8kwcg',
  JISR_API_SECRET: process.env.JISR_API_SECRET || 'gF5vi5OkV-WoPzv1I0MilA',
  DASHBOARD_PASSWORD: process.env.DASHBOARD_PASSWORD || 'gF5vi5OkV-WoPzv1I0MilA',
  EMPLOYEE_REFRESH_MS: 300_000,
  REQUEST_TIMEOUT_MS: 10_000,
  WORKER_INTERVAL_MS: 1_000,
  REORDER_WINDOW_MS: 5_000,
  MAX_FUTURE_SKEW_MS: 60_000,
  MAX_EVENT_AGE_MS: 604_800_000,
  RECONCILE_INTERVAL_MS: 30_000,
  SESSION_TTL_MS: 43_200_000,
  READER_DIRECTIONS: {} as Record<string, 'in' | 'out'>,
};
export type Config = typeof config;
