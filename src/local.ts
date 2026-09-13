import { serve } from '@hono/node-server';
import { config } from './config.js';
import { createApp } from './app.js';
import type { Confirmation, Employee, JisrGateway, Punch, Submission } from './domain.js';
import { Store } from './store.js';
import { Worker } from './worker.js';

class LocalJisr implements JisrGateway {
  private accepted = new Set<number>();
  async employees(): Promise<Employee[]> { return [{ id: 'local-employee', code: '007', email: 'local@example.com', name: 'Local Employee', active: true }]; }
  async prepare() {}
  async submit(punch: Punch): Promise<Submission> { this.accepted.add(punch.id); return { outcome: 'accepted', message: 'Accepted by local Jisr simulator' }; }
  async confirm(punch: Punch): Promise<Confirmation> { return this.accepted.has(punch.id) ? { outcome: 'confirmed', message: 'Confirmed by local Jisr simulator' } : { outcome: 'pending', message: 'Pending in local Jisr simulator' }; }
}

const localConfig = { ...config, PORT: 3001, DATABASE_PATH: ':memory:', REORDER_WINDOW_MS: 0, RECONCILE_INTERVAL_MS: 500 };
const store = new Store(localConfig.DATABASE_PATH);
const worker = new Worker(store, new LocalJisr(), localConfig);
const now = Date.now();
store.replaceEmployees([{ id: 'local-employee', code: '007', email: 'local@example.com', name: 'Local Employee', active: true }], now);
store.ingest(JSON.stringify({ events: [{ id: 'access.unlocks.location_unlocked', device: 'local-entry', device_name: 'Main Door-Entry', location_name: 'Main Door-Entry', user: 'local-user', user_name: 'Local Employee', time: String(Math.floor(now / 1000)), direction: 'entered', credential_type: 'FACE', admin: '', emergency_mode: '' }] }), now, localConfig);
const run = () => worker.tick().catch(error => store.set('workerError', String(error)));
const timer = setInterval(run, localConfig.WORKER_INTERVAL_MS);
void run();
const server = serve({ fetch: createApp(store, worker, localConfig).fetch, port: localConfig.PORT, hostname: '127.0.0.1' });
const shutdown = () => { clearInterval(timer); server.close(() => { store.close(); process.exit(0); }); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
