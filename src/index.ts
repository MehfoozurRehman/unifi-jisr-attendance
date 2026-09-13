import { serve } from '@hono/node-server';
import { config } from './config.js';
import { createApp } from './app.js';
import { JisrClient } from './jisr.js';
import { Store } from './store.js';
import { Worker } from './worker.js';

const store = new Store(config.DATABASE_PATH);
const worker = new Worker(store, new JisrClient(config), config);
store.recover(Date.now());
const run = () => worker.tick().catch(error => store.set('workerError', String(error)));
const timer = setInterval(run, config.WORKER_INTERVAL_MS);
void run();
const server = serve({ fetch: createApp(store, worker, config).fetch, port: config.PORT, hostname: '0.0.0.0' });
const shutdown = () => { clearInterval(timer); server.close(() => { store.close(); process.exit(0); }); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
