import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { config } from './config.js';
import { healthRoutes } from './routes/health.js';
import { unifiWebhookRoutes } from './routes/unifi-webhook.js';
import { adminRoutes } from './routes/admin.js';
import { jisrService } from './services/jisr.service.js';

const app = new Hono();

app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  console.log(`[HTTP] ${c.req.method} ${c.req.path} - ${c.res.status} (${ms}ms)`);
});

app.route('/health', healthRoutes);
app.route('/api/webhooks/unifi', unifiWebhookRoutes);
app.route('/api/admin', adminRoutes);

app.get('/', (c) => {
  return c.json({
    name: 'UniFi to Jisr Attendance Middleware',
    mode: 'zero-maintenance, zero-database',
    status: 'running',
    timestamp: new Date().toISOString(),
  });
});

if (config.NODE_ENV !== 'test') {

  jisrService.refreshEmployees().catch(() => {});
  
  const intervalMs = 15 * 60 * 1000;
  setInterval(() => {
    jisrService.refreshEmployees().catch((err: any) => {
      console.warn('[Background Sync] Non-blocking refresh warning:', err.message);
    });
  }, intervalMs);
}

process.on('uncaughtException', (err) => {
  console.error('[Process Error] Uncaught exception (recovered):', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Process Error] Unhandled rejection (recovered):', reason);
});

const port = config.PORT;
console.log(`🚀 UniFi-Jisr Attendance Service listening on port ${port} (Zero-DB / Zero-Maintenance Mode)`);

serve({
  fetch: app.fetch,
  port,
});

export default app;
