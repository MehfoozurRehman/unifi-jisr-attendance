export type Direction = 'in' | 'out';
export type EventStatus = 'queued' | 'held' | 'skipped' | 'duplicate' | 'sending' | 'submitted' | 'uncertain' | 'confirmed' | 'failed';
export interface NormalizedEvent {
  sourceId: string | null;
  fingerprint: string;
  occurredAt: number | null;
  timeSource: string | null;
  sourceTime: string | null;
  userId: string | null;
  email: string | null;
  name: string | null;
  readerId: string | null;
  door: string | null;
  direction: Direction | null;
  directionSource: string | null;
  status: EventStatus;
  reason: string;
}
export interface EventRow extends NormalizedEvent {
  id: number;
  deliveryId: number;
  receivedAt: number;
  raw: string;
  employeeId: string | null;
  employeeCode: string | null;
  employeeName: string | null;
  duplicateOf: number | null;
  punchId: number | null;
  request: string | null;
  nextAttemptAt: number;
  attempts: number;
  updatedAt: number;
}
export interface Employee { id: string; code: string; email: string | null; name: string; active: boolean }
export interface Punch { id: number; emp_code: string; terminal_sn: string; punch_time: string }
export interface Submission { outcome: 'accepted' | 'rejected' | 'retry' | 'uncertain'; message: string; response?: unknown }
export interface Confirmation { outcome: 'confirmed' | 'failed' | 'pending'; message: string; response?: unknown }
export interface JisrGateway {
  employees(): Promise<Employee[]>;
  prepare(): Promise<void>;
  submit(punch: Punch): Promise<Submission>;
  confirm(punch: Punch): Promise<Confirmation>;
}
