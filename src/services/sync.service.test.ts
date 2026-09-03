import { describe, it, expect } from 'vitest';
import { SyncService } from './sync.service.js';
import { DedupeService } from './dedupe.service.js';

describe('SyncService & Direction Logic', () => {
  const sync = new SyncService();

  it('detects IN punch from door or reader name with entry keywords', () => {
    const payload = {
      event: 'access.door.unlock',
      data: {
        door_name: 'Main Office Entrance Door',
        reader_name: 'Entry G2 Reader',
        result: 'ACCESS_GRANTED',
      },
    };
    expect(sync.determinePunchDirection(payload)).toBe('in');
  });

  it('detects OUT punch from door or reader name with exit keywords', () => {
    const payload = {
      event: 'access.door.unlock',
      data: {
        door_name: 'Emergency Exit Door',
        reader_name: 'Leave Reader',
        result: 'ACCESS_GRANTED',
      },
    };
    expect(sync.determinePunchDirection(payload)).toBe('out');
  });
});

describe('DedupeService', () => {
  it('deduplicates rapid swipes within threshold', () => {
    const dedupe = new DedupeService(60);
    const email = 'employee@company.com';
    const now = Date.now();

    expect(dedupe.isDuplicate(email, now)).toBe(false);
    expect(dedupe.isDuplicate(email, now + 5000)).toBe(true);
    expect(dedupe.isDuplicate(email, now + 65000)).toBe(false);
  });
});
