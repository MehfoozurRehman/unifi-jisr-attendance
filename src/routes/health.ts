import { Hono } from 'hono';
import { jisrService } from '../services/jisr.service.js';

export const healthRoutes = new Hono();

healthRoutes.get('/', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'unifi-jisr-attendance',
    jisrCachedEmployees: jisrService.getCacheSize(),
  });
});
