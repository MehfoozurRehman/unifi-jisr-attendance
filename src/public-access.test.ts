import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { config } from './config.js';
import type { JisrGateway } from './domain.js';
import { Store } from './store.js';
import { Worker } from './worker.js';

const gateway: JisrGateway = { employees: async () => [], prepare: async () => {}, submit: async () => ({ outcome: 'accepted', message: '' }), confirm: async () => ({ outcome: 'pending', message: '' }) };
const setup = () => { const s = new Store(':memory:'); const cfg = { ...config, DASHBOARD_PASSWORD: 'bootstrap-secret', UNIFI_WEBHOOK_SECRET: 'hook-secret' }; return { s, app: createApp(s, new Worker(s, gateway, cfg), cfg) }; };
const login = (app: ReturnType<typeof createApp>, password: string, headers: Record<string, string>) => app.request('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ username: 'admin', password }) });
const hook = (app: ReturnType<typeof createApp>, headers: Record<string, string>) => app.request('/api/webhook/unifi', { method: 'POST', headers: { 'x-webhook-secret': 'hook-secret', ...headers }, body: '{}' });

describe('public access through the Cloudflare tunnel', () => {
  it('refuses door events from the tunnel but accepts them from the office network', async () => {
    const { s, app } = setup();
    expect((await hook(app, { 'cf-connecting-ip': '203.0.113.9' })).status).toBe(403);
    expect((await hook(app, {})).status).not.toBe(403);
    s.close();
  });
  it('marks the session cookie Secure over HTTPS only', async () => {
    const { s, app } = setup();
    expect((await login(app, 'bootstrap-secret', { 'x-forwarded-proto': 'https' })).headers.get('set-cookie')).toContain('Secure');
    expect((await login(app, 'bootstrap-secret', {})).headers.get('set-cookie')).not.toContain('Secure');
    s.close();
  });
  it('locks out by the Cloudflare address, however X-Forwarded-For is faked', async () => {
    const { s, app } = setup();
    const ip = '203.0.113.77';
    let last = 0;
    // A new username each time, so only the address can trigger the lockout.
    for (let i = 0; i < 40 && last !== 429; i++) {
      const r = await app.request('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': ip, 'x-forwarded-for': `10.0.0.${i}` }, body: JSON.stringify({ username: `guess${i}`, password: 'wrong password' }) });
      last = r.status;
    }
    expect(last).toBe(429);
    s.close();
  });
});
