import { config } from '../config.js';
import type { UnifiWebhookPayload } from '../types/unifi.types.js';
import type { PunchType } from '../types/jisr.types.js';
import { dedupeService } from './dedupe.service.js';
import { jisrService } from './jisr.service.js';
import { unifiService } from './unifi.service.js';

export interface ProcessResult {
  status: 'PROCESSED' | 'IGNORED' | 'DUPLICATE' | 'ERROR' | 'UNMATCHED_USER';
  reason?: string;
  employee_id?: string | number;
  email?: string;
  punch_type?: PunchType;
  timestamp?: string;
}

export class SyncService {
  public determinePunchDirection(payload: UnifiWebhookPayload): PunchType {
    const textSources = [
      payload.data?.reader_name,
      payload.data?.door_name,
      payload.target?.name,
      payload.target?.display_name,
      payload.data?.event_type,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    const matchesIn = config.IN_KEYWORDS.some((kw) => textSources.includes(kw));
    const matchesOut = config.OUT_KEYWORDS.some((kw) => textSources.includes(kw));

    if (matchesIn && !matchesOut) return 'in';
    if (matchesOut && !matchesIn) return 'out';

    return config.DEFAULT_DIRECTION === 'out' ? 'out' : 'in';
  }

  public extractTimestamp(payload: UnifiWebhookPayload): string {
    const rawTime =
      payload.timestamp ||
      payload.data?.timestamp ||
      Date.now();

    const date = typeof rawTime === 'number'
      ? new Date(rawTime > 1e11 ? rawTime : rawTime * 1000)
      : new Date(rawTime);

    return !isNaN(date.getTime()) ? date.toISOString() : new Date().toISOString();
  }

  public async handleUnifiEvent(payload: UnifiWebhookPayload): Promise<ProcessResult> {
    const eventType = payload.event || payload.data?.event_type;
    console.log(`[Sync] Processing event: ${eventType || 'unspecified'}`);

    if (eventType && !eventType.includes('door.unlock') && !eventType.includes('access')) {
      console.log(`[Sync] ⏭️ Ignored non-access event: ${eventType}`);
      return {
        status: 'IGNORED',
        reason: `Ignored non-access event: ${eventType}`,
      };
    }

    const result = payload.data?.result?.toUpperCase();
    if (result && result !== 'ACCESS_GRANTED' && result !== 'SUCCESS' && result !== 'PASSED') {
      console.log(`[Sync] ⏭️ Access attempt was not granted (result: ${result})`);
      return {
        status: 'IGNORED',
        reason: `Access attempt was not granted: ${result}`,
      };
    }

    let email: string | undefined =
      payload.actor?.email ||
      payload.data?.user_email;

    const userId = payload.actor?.id || payload.data?.user_id;
    console.log(`[Sync] User detected - Email in payload: ${email || 'NONE'}, User ID: ${userId || 'NONE'}`);

    if (!email && userId) {
      console.log(`[Sync] Querying UniFi API for email with user ID: ${userId}...`);
      const user = await unifiService.getUser(userId);
      if (user?.email) {
        email = user.email;
        console.log(`[Sync] Resolved email via UniFi API: ${email}`);
      }
    }

    if (!email) {
      console.warn(`[Sync] ⚠️ No email found for user ID: ${userId || 'unknown'}`);
      return {
        status: 'UNMATCHED_USER',
        reason: `No email found for user ID: ${userId || 'unknown'}`,
      };
    }

    const timestampIso = this.extractTimestamp(payload);
    const eventMs = new Date(timestampIso).getTime();

    if (dedupeService.isDuplicate(email, eventMs)) {
      console.log(`[Sync] ⏭️ Duplicate swipe ignored for ${email} (within ${config.DEDUPLICATION_WINDOW_SECONDS}s)`);
      return {
        status: 'DUPLICATE',
        reason: `Duplicate swipe ignored within ${config.DEDUPLICATION_WINDOW_SECONDS}s window`,
        email,
      };
    }

    console.log(`[Sync] Looking up employee in Jisr for email: ${email}...`);
    const employee = await jisrService.getEmployeeByEmail(email);
    if (!employee) {
      console.warn(`[Sync] ❌ No Jisr employee found matching email: ${email}`);
      return {
        status: 'UNMATCHED_USER',
        reason: `No Jisr employee found matching email: ${email}`,
        email,
      };
    }

    console.log(`[Sync] ✅ Matched Jisr employee: ${employee.first_name || ''} ${employee.last_name || ''} (ID: ${employee.id})`);

    const punchType = this.determinePunchDirection(payload);
    const deviceId = payload.data?.reader_id || payload.data?.door_id || 'unifi-reader';
    const doorName = payload.data?.door_name || payload.target?.name || 'Main Access Door';

    console.log(`[Sync] Classified punch direction: ${punchType.toUpperCase()} based on door/reader: "${doorName}"`);

    const jisrResult = await jisrService.logAttendance({
      employee_id: employee.id,
      timestamp: timestampIso,
      punch_type: punchType,
      device_id: deviceId,
      source: `UniFi Access (${doorName})`,
      note: `Card swipe at ${doorName}`,
    });

    if (!jisrResult.success) {
      console.error(`[Sync] ❌ Jisr attendance log failed: ${jisrResult.message}`);
      return {
        status: 'ERROR',
        reason: jisrResult.message,
        employee_id: employee.id,
        email,
        punch_type: punchType,
        timestamp: timestampIso,
      };
    }

    console.log(`[Sync] 🎉 Successfully recorded ${punchType.toUpperCase()} punch for ${email} in Jisr!`);

    return {
      status: 'PROCESSED',
      employee_id: employee.id,
      email,
      punch_type: punchType,
      timestamp: timestampIso,
    };
  }
}

export const syncService = new SyncService();
