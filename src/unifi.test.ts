import { describe, expect, it } from 'vitest';
import { pickEmail } from './unifi.js';

describe('pickEmail', () => {
  it('prefers user_email when email is an empty string', () => {
    expect(pickEmail({ email: '', user_email: 'Person@Example.com ' })).toBe('person@example.com');
  });
  it('falls back to email and upn', () => {
    expect(pickEmail({ email: 'a@example.com' })).toBe('a@example.com');
    expect(pickEmail({ upn: 'b@example.com' })).toBe('b@example.com');
  });
  it('returns an empty string when no field holds an address', () => {
    expect(pickEmail({ email: '', user_email: 'not-an-email' })).toBe('');
    expect(pickEmail(null)).toBe('');
  });
});
