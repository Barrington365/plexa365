import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./sessions', () => ({ sessionFromRequest: vi.fn() }));
vi.mock('./store', () => ({ readAuthData: vi.fn() }));
import { sessionFromRequest } from './sessions';
import { readAuthData } from './store';
import { requireAdmin } from './guards';
describe('current account agent permissions', () => {
 beforeEach(() => vi.resetAllMocks());
 it.each(['editor','viewer','guest'])('denies %s even with an old admin session', async role => {
  vi.mocked(sessionFromRequest).mockReturnValue({userId:'u',role:'admin'} as never);
  vi.mocked(readAuthData).mockResolvedValue({users:{u:{id:'u',role,active:true,emailVerifiedAt:'2026-01-01'}}} as never);
  const result=await requireAdmin(new Request('https://studio.test'));
  expect('response' in result && result.response.status).toBe(403);
 });
 it('allows an active verified admin from current account records', async () => {
  vi.mocked(sessionFromRequest).mockReturnValue({userId:'u',role:'viewer'} as never);
  vi.mocked(readAuthData).mockResolvedValue({users:{u:{id:'u',role:'admin',active:true,emailVerifiedAt:'2026-01-01'}}} as never);
  expect(await requireAdmin(new Request('https://studio.test'))).toHaveProperty('user.role','admin');
 });
 it('denies deactivated admins', async () => {
  vi.mocked(sessionFromRequest).mockReturnValue({userId:'u',role:'admin'} as never);
  vi.mocked(readAuthData).mockResolvedValue({users:{u:{id:'u',role:'admin',active:false,emailVerifiedAt:'2026-01-01'}}} as never);
  const result=await requireAdmin(new Request('https://studio.test'));
  expect('response' in result && result.response.status).toBe(403);
 });
});
