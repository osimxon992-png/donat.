import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { LogMailer } from '../src/modules/notifications/mailer';
import { createTestContext, newClient, ORIGIN, PASSWORD, registerClient, resetDb, type TestContext } from './helpers';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => ctx.close());
beforeEach(async () => {
  await resetDb(ctx.prisma);
});

describe('registration and login', () => {
  it('registers, sets httpOnly cookies and returns the profile', async () => {
    const client = await newClient(ctx);
    const res = await client.post('/api/auth/register', { email: 'New@Test.dev', password: PASSWORD, name: 'Neo' });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('new@test.dev');
    expect(res.body.user.role).toBe('CUSTOMER');
    expect(res.body.user).not.toHaveProperty('passwordHash');
    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    expect(cookies.find((c) => c.startsWith('access_token='))).toMatch(/HttpOnly/i);
    expect(cookies.find((c) => c.startsWith('refresh_token='))).toMatch(/HttpOnly/i);

    const me = await client.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.name).toBe('Neo');

    const stored = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'new@test.dev' } });
    expect(stored.passwordHash).toMatch(/^scrypt\$/);
    expect(stored.passwordHash).not.toContain(PASSWORD);
  });

  it('rejects weak passwords and duplicate emails', async () => {
    const client = await newClient(ctx);
    const weak = await client.post('/api/auth/register', { email: 'a@test.dev', password: 'short', name: 'A' });
    expect(weak.status).toBe(400);
    expect(weak.body.error.code).toBe('VALIDATION_ERROR');

    await registerClient(ctx, 'dup@test.dev');
    const dup = await client.post('/api/auth/register', { email: 'dup@test.dev', password: PASSWORD, name: 'Dup' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('logs in with correct credentials and rejects wrong ones with a generic message', async () => {
    await registerClient(ctx, 'login@test.dev');
    const client = await newClient(ctx);
    const bad = await client.post('/api/auth/login', { email: 'login@test.dev', password: 'Wrong-password-1' });
    expect(bad.status).toBe(401);
    const unknown = await client.post('/api/auth/login', { email: 'nobody@test.dev', password: 'Wrong-password-1' });
    expect(unknown.status).toBe(401);
    expect(unknown.body.error.message).toBe(bad.body.error.message);
    const ok = await client.post('/api/auth/login', { email: 'login@test.dev', password: PASSWORD });
    expect(ok.status).toBe(200);
  });

  it('locks the account after repeated failures', async () => {
    await registerClient(ctx, 'lock@test.dev');
    const client = await newClient(ctx);
    for (let i = 0; i < 5; i++) await client.post('/api/auth/login', { email: 'lock@test.dev', password: 'Wrong-password-1' });
    const locked = await client.post('/api/auth/login', { email: 'lock@test.dev', password: PASSWORD });
    expect(locked.status).toBe(423);
  });

  it('rejects suspended users', async () => {
    const { user } = await registerClient(ctx, 'sus@test.dev');
    await ctx.prisma.user.update({ where: { id: user.id }, data: { status: 'SUSPENDED' } });
    const client = await newClient(ctx);
    const res = await client.post('/api/auth/login', { email: 'sus@test.dev', password: PASSWORD });
    expect(res.status).toBe(403);
  });
});

describe('session security', () => {
  it('requires a CSRF token for cookie-authenticated mutations', async () => {
    const agent = request.agent(ctx.app);
    const res = await agent.post('/api/auth/login').set('Origin', ORIGIN).send({ email: 'x@test.dev', password: 'x' });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/CSRF/);
  });

  it('blocks unexpected origins', async () => {
    const client = await newClient(ctx);
    const res = await client.agent
      .post('/api/auth/login')
      .set('Origin', 'https://evil.example')
      .set('X-CSRF-Token', client.csrf)
      .send({ email: 'x@test.dev', password: 'x' });
    expect(res.status).toBe(403);
  });

  it('rejects tampered or missing JWTs', async () => {
    const res = await request(ctx.app).get('/api/auth/me').set('Authorization', 'Bearer abc.def.ghi');
    expect(res.status).toBe(401);
    const none = await request(ctx.app).get('/api/auth/me');
    expect(none.status).toBe(401);
  });

  it('rotates refresh tokens and revokes the session on reuse', async () => {
    // Over HTTP: the refresh endpoint rotates the cookie.
    const { client, user } = await registerClient(ctx);
    const first = await client.post('/api/auth/refresh');
    expect(first.status).toBe(200);
    expect(([] as string[]).concat(first.headers['set-cookie'] ?? []).some((c) => c.startsWith('refresh_token='))).toBe(true);
    expect((await client.get('/api/auth/me')).status).toBe(200);

    // Service level, so we hold the raw tokens.
    const issued = await ctx.c.auth.login({ email: user.email, password: PASSWORD }, {});
    const rotated = await ctx.c.auth.refresh(issued.tokens.refreshToken, {});
    expect(rotated.refreshToken).not.toBe(issued.tokens.refreshToken);
    // An attacker replays the old token after the grace window...
    await ctx.prisma.session.updateMany({ data: { rotatedAt: new Date(Date.now() - 60_000) } });
    await expect(ctx.c.auth.refresh(issued.tokens.refreshToken, {})).rejects.toThrow();
    // ...which revokes the session, so even the legitimate new token stops working.
    await expect(ctx.c.auth.refresh(rotated.refreshToken, {})).rejects.toThrow();
    const audit = await ctx.prisma.auditLog.findFirst({ where: { action: 'auth.refresh_token_reuse' } });
    expect(audit).not.toBeNull();
  });

  it('logout revokes the session so the access token stops working', async () => {
    const { client } = await registerClient(ctx);
    expect((await client.get('/api/auth/me')).status).toBe(200);
    await client.post('/api/auth/logout');
    expect((await ctx.prisma.session.findFirstOrThrow()).revokedAt).not.toBeNull();
    const after = await client.get('/api/auth/me');
    expect(after.status).toBe(401);
  });
});

describe('password management', () => {
  it('changes the password with the current password and signs out other sessions', async () => {
    const { client, user } = await registerClient(ctx, 'pw@test.dev');
    const other = await newClient(ctx);
    await other.post('/api/auth/login', { email: 'pw@test.dev', password: PASSWORD });

    const wrong = await client.post('/api/auth/password/change', { currentPassword: 'nope-nope-1', newPassword: 'Brand-new-pass-9' });
    expect(wrong.status).toBe(400);
    const ok = await client.post('/api/auth/password/change', { currentPassword: PASSWORD, newPassword: 'Brand-new-pass-9' });
    expect(ok.status).toBe(200);

    expect((await other.get('/api/auth/me')).status).toBe(401);
    expect((await client.get('/api/auth/me')).status).toBe(200);
    const relog = await (await newClient(ctx)).post('/api/auth/login', { email: user.email, password: 'Brand-new-pass-9' });
    expect(relog.status).toBe(200);
  });

  it('resets a forgotten password with a single-use token', async () => {
    await registerClient(ctx, 'reset@test.dev');
    const client = await newClient(ctx);
    const unknown = await client.post('/api/auth/password/forgot', { email: 'ghost@test.dev' });
    expect(unknown.status).toBe(200);
    const res = await client.post('/api/auth/password/forgot', { email: 'reset@test.dev' });
    expect(res.status).toBe(200);
    const mail = (ctx.c.mailer as LogMailer).sent.at(-1)!;
    const token = decodeURIComponent(/token=([^\s]+)/.exec(mail.text)![1]!);
    const reset = await client.post('/api/auth/password/reset', { token, newPassword: 'Reset-pass-123' });
    expect(reset.status).toBe(200);
    const again = await client.post('/api/auth/password/reset', { token, newPassword: 'Reset-pass-456' });
    expect(again.status).toBe(400);
    const login = await client.post('/api/auth/login', { email: 'reset@test.dev', password: 'Reset-pass-123' });
    expect(login.status).toBe(200);
  });
});
