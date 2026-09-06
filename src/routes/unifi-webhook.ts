import { Hono } from 'hono';
import { config } from '../config.js';
import { syncService } from '../services/sync.service.js';
import type { UnifiWebhookPayload } from '../types/unifi.types.js';

export const unifiWebhookRoutes = new Hono();

unifiWebhookRoutes.post('/', async (c) => {

  const secretParam = c.req.query('secret');
  const authHeader = c.req.header('Authorization') || c.req.header('x-webhook-secret');
  const token = secretParam || authHeader?.replace(/^Bearer\s+/i, '');

  console.log(`[Webhook] Incoming request received at ${new Date().toISOString()}`);
  console.log(`[Webhook] Auth token provided: ${token ? 'YES (length ' + token.length + ')' : 'NONE'}`);

  if (config.UNIFI_WEBHOOK_SECRET && token !== config.UNIFI_WEBHOOK_SECRET) {
    console.warn(`[Webhook] ⚠️ Unauthorized request. Token mismatch! Expected: ${config.UNIFI_WEBHOOK_SECRET}`);
    return c.json({ error: 'Unauthorized webhook request' }, 401);
  }

  try {
    const rawBody = await c.req.text();
    console.log(`[Webhook] Raw Payload (${rawBody.length} bytes):`, rawBody);

    const body = JSON.parse(rawBody) as UnifiWebhookPayload;
    console.log('[Webhook] Parsed UniFi event:', body.event || body.data?.event_type || 'custom-event');

    const result = await syncService.handleUnifiEvent(body);
    console.log(`[Webhook] Result status: ${result.status} | Reason: ${result.reason || 'SUCCESS'}`);

    const statusCode = result.status === 'ERROR' ? 500 : 200;
    return c.json(result, statusCode);
  } catch (error: any) {
    console.error('[Webhook] ❌ Error processing webhook event:', error);
    return c.json(
      {
        status: 'ERROR',
        error: error.message || 'Internal server error processing webhook',
      },
      500
    );
  }
});
