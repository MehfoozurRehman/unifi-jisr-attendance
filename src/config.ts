import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  UNIFI_WEBHOOK_SECRET: z.string().default('unifi-secret-2026'),
  UNIFI_BASE_URL: z
    .string()
    .optional()
    .transform((val) => (val && !val.includes('your-unifi') ? val : undefined)),
  UNIFI_API_TOKEN: z
    .string()
    .optional()
    .transform((val) => (val && !val.includes('your_unifi') ? val : undefined)),
  UNIFI_IGNORE_SSL: z
    .string()
    .transform((val) => val === 'true' || val === '1')
    .default('false'),

  JISR_HOST_TYPE: z
    .string()
    .default('cloud')
    .transform((val) => val.toLowerCase() as 'cloud' | 'local'),
  JISR_CUSTOM_BASE_URL: z.string().url().optional(),
  JISR_API_KEY: z.string().default('kbmnySRFFoiGJ_2zW8kwcg'),
  JISR_API_SECRET: z.string().default('gF5vi5OkV-WoPzv1I0MilA'),
  JISR_SYNC_INTERVAL_MINUTES: z.coerce.number().default(5),

  DEDUPLICATION_WINDOW_SECONDS: z.coerce.number().default(60),
  IN_KEYWORDS: z
    .string()
    .default('in,entry,entrance,check-in,arrival,start')
    .transform((val) => val.split(',').map((k) => k.trim().toLowerCase())),
  OUT_KEYWORDS: z
    .string()
    .default('out,exit,departure,check-out,leave')
    .transform((val) => val.split(',').map((k) => k.trim().toLowerCase())),
  DEFAULT_DIRECTION: z.enum(['in', 'out', 'toggle']).default('in'),
});

export type Config = z.infer<typeof envSchema>;

function loadConfig(): Config {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('❌ Invalid environment configuration:', parsed.error.format());

    if (process.env.NODE_ENV === 'test') {
      return envSchema.parse({
        JISR_API_KEY: 'test-key',
      });
    }
    process.exit(1);
  }
  return parsed.data;
}

export const config = loadConfig();
