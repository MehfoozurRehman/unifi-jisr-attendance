import { Hono } from 'hono';
import { config } from '../config.js';
import { syncService } from '../services/sync.service.js';
import type { UnifiWebhookPayload } from '../types/unifi.types.js';

export const unifiWebhookRoutes = new Hono();

unifiWebhookRoutes.post('/', async (c) => {

  const secretParam = c.req.query('secret');
  const authHeader = c.req.header('Authorization') || c.req.header('x-webhook-secret');
  const token = secretParam || authHeader?.replace(/^Bearer\s+/i, '');

  if (config.UNIFI_WEBHOOK_SECRET && token !== config.UNIFI_WEBHOOK_SECRET) {
    return c.json({ error: 'Unauthorized webhook request' }, 401);
  }

  try {
    const body = await c.req.json<UnifiWebhookPayload>();
    console.log('[Webhook] Received UniFi Access event:', JSON.stringify(body, null, 2));

    const result = await syncService.handleUnifiEvent(body);

    const statusCode = result.status === 'ERROR' ? 500 : 200;
    return c.json(result, statusCode);
  } catch (error: any) {
    console.error('[Webhook] Error processing webhook event:', error);
    return c.json(
      {
        status: 'ERROR',
        error: error.message || 'Internal server error processing webhook',
      },
      500
    );
  }
});
