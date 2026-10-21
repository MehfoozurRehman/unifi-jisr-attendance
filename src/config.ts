const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

export const config = {
  PORT: Number(process.env.PORT ?? 3000),
  DATABASE_PATH: './data/attendance.sqlite',
  TIMEZONE: 'Asia/Riyadh',
  UNIFI_WEBHOOK_SECRET: required('UNIFI_WEBHOOK_SECRET'),
  UNIFI_BASE_URL: process.env.UNIFI_BASE_URL || 'https://192.168.8.1',
  UNIFI_API_TOKEN: required('UNIFI_API_TOKEN'),
  JISR_BASE_URL: process.env.JISR_BASE_URL || 'https://apis.jisr.net/api',
  JISR_SLUG: process.env.JISR_SLUG || 'zood',
  JISR_API_KEY: required('JISR_API_KEY'),
  JISR_API_SECRET: required('JISR_API_SECRET'),
  DASHBOARD_PASSWORD: required('DASHBOARD_PASSWORD'),
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
