import { Hono } from 'hono';
import { jisrService } from '../services/jisr.service.js';
import { syncService } from '../services/sync.service.js';

export const adminRoutes = new Hono();

adminRoutes.post('/refresh-jisr-cache', async (c) => {
  await jisrService.refreshEmployees();
  return c.json({
    message: 'Cache refreshed',
    cachedCount: jisrService.getCacheSize(),
  });
});

adminRoutes.post('/test-punch', async (c) => {
  const body = await c.req.json<{ email: string; direction?: 'in' | 'out'; door?: string }>();
  if (!body.email) {
    return c.json({ error: 'email is required' }, 400);
  }

  const simulatedPayload = {
    event: 'access.door.unlock',
    timestamp: Date.now(),
    actor: {
      email: body.email,
    },
    data: {
      result: 'ACCESS_GRANTED',
      door_name: body.door || (body.direction === 'out' ? 'Main Exit' : 'Main Entrance'),
      user_email: body.email,
    },
  };

  const result = await syncService.handleUnifiEvent(simulatedPayload);
  return c.json(result);
});
