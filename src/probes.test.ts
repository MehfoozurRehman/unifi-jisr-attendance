import { beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from './config.js';
import { JisrClient } from './jisr.js';

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('undici', async original => ({ ...(await original<typeof import('undici')>()), fetch: fetchMock }));
const { UnifiClient } = await import('./unifi.js');

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const users = (from: number, count: number, extra: object = { user_email: 'a@example.com' }) => Array.from({ length: count }, (_, i) => ({ id: String(from + i), full_name: `User ${from + i}`, status: 'ACTIVE', ...extra }));

describe('UniFi health probe', () => {
  beforeEach(() => fetchMock.mockReset());
  it('reads every page before counting', async () => {
    fetchMock.mockResolvedValueOnce(json({ data: users(0, 1000), pagination: { total: 1002 } }));
    fetchMock.mockResolvedValueOnce(json({ data: users(1000, 2, {}), pagination: { total: 1002 } }));
    const result = await new UnifiClient(config).probe();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain('page_num=2');
    expect(result).toMatchObject({ ok: true, users: 1002, withoutEmail: ['User 1000', 'User 1001'] });
  });
  it('stops after one short page when UniFi sends no total', async () => {
    fetchMock.mockResolvedValueOnce(json({ data: users(0, 3) }));
    expect(await new UnifiClient(config).probe()).toMatchObject({ ok: true, users: 3 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('fails on a 200 without a user list, instead of reporting an empty directory', async () => {
    fetchMock.mockResolvedValueOnce(json({ message: 'maintenance' }));
    expect(await new UnifiClient(config).probe()).toMatchObject({ ok: false, status: 200, message: 'invalidResponse', users: null });
    fetchMock.mockResolvedValueOnce(new Response('<html>login</html>', { status: 200 }));
    expect(await new UnifiClient(config).probe()).toMatchObject({ ok: false, message: 'invalidResponse' });
  });
});

describe('Jisr health probe', () => {
  it('does not count a 200 without success: true as a working read', async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).endsWith('/auth')) return json({ success: true, data: 'token' });
      return String(url).includes('employees') ? new Response('<html>error</html>', { status: 200 }) : json({ success: true, data: {} });
    }) as unknown as typeof fetch;
    const result = await new JisrClient(config, fetcher).probe();
    expect(result.auth.ok).toBe(true);
    expect(result.employees.ok).toBe(false);
    expect(result.attendance.ok).toBe(true);
  });
});
