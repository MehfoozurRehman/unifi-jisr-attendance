import type { Config } from './config.js';
import type { EventRow, JisrGateway, Punch } from './domain.js';
import { Store } from './store.js';

export class Worker {
  private busy = false;
  constructor(readonly store: Store, readonly gateway: JisrGateway, readonly config: Config, readonly clock = Date.now) {}
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const now = this.clock();
      if (now - Number(this.store.setting('employeesRefreshedAt') || 0) > this.config.EMPLOYEE_REFRESH_MS && now >= Number(this.store.setting('employeeRetryAt') || 0)) {
        try { this.store.replaceEmployees(await this.gateway.employees(), now); }
        catch (e) { this.store.set('employeeError', String(e)); this.store.set('employeeRetryAt', String(now + 60_000)); }
      }
      for (const event of this.store.unresolved(now)) await this.reconcile(event);
      if (this.store.setting('paused') === 'true') { this.store.set('workerLastTick', String(this.clock())); return; }
      for (const event of this.store.ready(now)) await this.process(event);
      this.store.set('workerLastTick', String(this.clock()));
    } finally { this.busy = false; }
  }
  private async process(event: EventRow) {
    const now = this.clock();
    if (!this.store.setting('employeesRefreshedAt')) {
      this.store.update(event.id, { reason: 'Waiting for employee directory', nextAttemptAt: now + 30_000 }, now); return;
    }
    const employee = this.store.match(event);
    if (!employee) { this.store.update(event.id, { status: 'held', reason: 'No unique active employee match; exact identity required' }, now); return; }
    this.store.update(event.id, { employeeId: employee.id, employeeCode: employee.code, employeeName: employee.name }, now);
    const unresolved = this.store.db.prepare("SELECT id FROM events WHERE employeeId=? AND id<>? AND status IN ('sending','submitted','uncertain') LIMIT 1").get(employee.id, event.id);
    if (unresolved) { this.store.update(event.id, { reason: 'Waiting for previous employee punch confirmation', nextAttemptAt: now + 5_000 }, now); return; }
    const previous = this.store.db.prepare("SELECT * FROM events WHERE employeeId=? AND status='confirmed' ORDER BY occurredAt DESC,id DESC LIMIT 1").get(employee.id) as unknown as EventRow | undefined;
    if (previous && event.occurredAt! <= previous.occurredAt!) {
      this.store.update(event.id, { status: event.occurredAt === previous.occurredAt && event.direction === previous.direction ? 'duplicate' : 'held', reason: 'Event is not later than the last confirmed punch; cannot safely insert into existing attendance', duplicateOf: previous.id }, now); return;
    }
    if (previous && previous.direction === event.direction) {
      this.store.update(event.id, { status: 'skipped', reason: `Repeated ${event.direction} without an intervening opposite direction`, duplicateOf: previous.id }, now); return;
    }
    const punch: Punch = event.request ? JSON.parse(event.request) : {
      id: event.id, emp_code: employee.code, terminal_sn: event.readerId || 'UNIFI-ACCESS', punch_time: new Date(event.occurredAt!).toISOString(),
    };
    try { await this.gateway.prepare(); }
    catch (e) { this.store.update(event.id, { reason: `Jisr unavailable before submission: ${String(e)}`, nextAttemptAt: now + 30_000 }, now); return; }
    if (!this.store.beginSend(event, punch, now)) return;
    try {
      const result = await this.gateway.submit(punch);
      this.store.transaction(() => {
        this.store.audit(event.id, 'submit', result.outcome, result, this.clock());
        this.store.update(event.id, { status: result.outcome === 'accepted' ? 'submitted' : result.outcome === 'retry' ? 'queued' : result.outcome === 'rejected' ? 'failed' : 'uncertain', reason: result.message, nextAttemptAt: this.clock() + this.config.RECONCILE_INTERVAL_MS }, this.clock());
      });
    } catch (e) {
      this.store.update(event.id, { status: 'uncertain', reason: `Unknown submission outcome: ${String(e)}`, nextAttemptAt: this.clock() + this.config.RECONCILE_INTERVAL_MS }, this.clock());
    }
  }
  private async reconcile(event: EventRow) {
    try {
      const result = await this.gateway.confirm(JSON.parse(event.request!));
      this.store.transaction(() => {
        this.store.audit(event.id, 'confirm', result.outcome, result, this.clock());
        this.store.update(event.id, { status: result.outcome === 'pending' ? event.status : result.outcome, reason: result.message, nextAttemptAt: this.clock() + this.config.RECONCILE_INTERVAL_MS }, this.clock());
      });
    } catch (e) {
      this.store.update(event.id, { reason: `Confirmation unavailable: ${String(e)}`, nextAttemptAt: this.clock() + this.config.RECONCILE_INTERVAL_MS }, this.clock());
    }
  }
}
