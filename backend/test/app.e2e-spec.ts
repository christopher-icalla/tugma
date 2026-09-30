import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Keypair, TransactionBuilder } from '@stellar/stellar-sdk';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DEMO_ORG_ID } from '../src/config';
import { configureApp } from '../src/main';
import { SeedService } from '../src/seed/seed.service';
import { SorobanService } from '../src/stellar/soroban.service';
import { FakeSoroban } from './fake-soroban';

const ADMIN = { email: process.env.ADMIN_EMAIL!, password: process.env.ADMIN_PASSWORD! };
const demo = (role: string) => ({ email: `${role}@tugmademo.ph`, password: process.env.DEMO_USER_PASSWORD! });
const HERO_EXC = 'EXC-CTRL-005-TX-847291';

let app: NestExpressApplication;
let soroban: FakeSoroban;
const agents: Record<string, request.Agent> = {};

async function login(name: string, creds: { email: string; password: string }) {
  const agent = request.agent(app.getHttpServer());
  const res = await agent.post('/api/auth/login').send(creds);
  expect(res.status).toBe(200);
  agents[name] = agent;
  return res;
}

beforeAll(async () => {
  soroban = new FakeSoroban();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SorobanService)
    .useValue(soroban)
    .compile();
  app = configureApp(moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false }));
  await app.init();
  await app.get(SeedService).run();
  for (const role of ['compliance', 'risk', 'ops', 'auditor', 'viewer']) await login(role, demo(role));
  await login('admin', ADMIN);
});

afterAll(async () => {
  await app?.close();
});

describe('auth', () => {
  it('logs in without leaking the password hash and sets both cookies', async () => {
    const res = await request(app.getHttpServer()).post('/api/auth/login').send(ADMIN);
    expect(res.body).toMatchObject({ email: ADMIN.email, role: 'ADMIN' });
    expect(res.body.password_hash).toBeUndefined();
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((c) => c.startsWith('access_token='))).toBe(true);
    expect(cookies.some((c) => c.startsWith('refresh_token='))).toBe(true);
  });

  it('rejects bad credentials and unauthenticated requests with { detail }', async () => {
    const bad = await request(app.getHttpServer()).post('/api/auth/login').send({ ...ADMIN, password: 'wrong' });
    expect(bad.status).toBe(401);
    expect(bad.body.detail).toBe('Invalid email or password.');
    expect((await request(app.getHttpServer()).get('/api/auth/me')).status).toBe(401);
    expect((await request(app.getHttpServer()).get('/api/dashboard/summary')).status).toBe(401);
  });

  it('answers forgot-password generically for unknown emails', async () => {
    const res = await request(app.getHttpServer()).post('/api/auth/forgot-password').send({ email: 'unknown@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/If that email is registered/);
  });

  it('logs out', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/api/auth/login').send(demo('viewer'));
    expect((await agent.post('/api/auth/logout')).status).toBe(200);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });
});

describe('control engine results', () => {
  it('reports the dashboard KPIs derived from the 10k dataset', async () => {
    const { body } = await agents.admin.get('/api/dashboard/summary');
    expect(body.kpis).toMatchObject({ transactions_analyzed: 10000, controls_tested: 5, exceptions: 122, high_risk: 72 });
    const by = Object.fromEntries(body.control_health.map((c: { control_code: string }) => [c.control_code, c]));
    expect(by['CTRL-005']).toMatchObject({ records_tested: 10000, failed_count: 82, not_testable_count: 150 });
    expect(by['CTRL-002']).toMatchObject({ failed_count: 30 });
    expect(by['CTRL-004']).toMatchObject({ warning_count: 10 });
  });

  it('explains the hero exception', async () => {
    const { body } = await agents.admin.get(`/api/exceptions/${HERO_EXC}`);
    expect(body.exception.transaction_id).toBe('TX-847291');
    expect(body.exception.explanation).toMatchObject({
      expected: 'PHP 10,000.00', actual: 'PHP 9,500.00', variance: 'PHP 500.00', result: 'FAILED',
    });
  });

  it('returns money as numbers', async () => {
    const { body } = await agents.admin.get('/api/transactions/TX-847291');
    expect(body.transaction).toMatchObject({ transaction_amount: 10000, actual_settlement: 9500, test_status: 'FAIL' });
    expect(body.control_results).toContainEqual({ control_code: 'CTRL-005', result: 'FAIL' });
  });

  it('paginates, filters, searches and sorts transactions', async () => {
    const all = await agents.admin.get('/api/transactions');
    expect(all.body).toMatchObject({ total: 10000, pages: 400 });
    expect(all.body.transactions).toHaveLength(25);
    expect((await agents.admin.get('/api/transactions?page_size=500')).status).toBe(422);
    expect((await agents.admin.get('/api/transactions?search=847291')).body.total).toBe(1);
    const failed = await agents.admin.get('/api/transactions?control=CTRL-005&test_status=FAIL&page_size=100');
    expect(failed.body.total).toBe(82);
    const sorted = await agents.admin.get('/api/transactions?sort=transaction_amount&direction=desc');
    const amounts = sorted.body.transactions.map((t: { transaction_amount: number }) => t.transaction_amount);
    expect(amounts).toEqual([...amounts].sort((a, b) => b - a));
  });

  it('appends a run on re-run without duplicating exceptions', async () => {
    const before = (await agents.admin.get('/api/controls/CTRL-005')).body;
    const run = await agents.ops.post('/api/controls/run');
    expect(run.status).toBe(200);
    const after = (await agents.admin.get('/api/controls/CTRL-005')).body;
    expect(after.runs).toHaveLength(before.runs.length + 1);
    expect(after.exceptions_count).toBe(before.exceptions_count);
    expect((await agents.viewer.post('/api/controls/run')).status).toBe(403);
  });

  it('builds the evidence chain', async () => {
    const { body } = await agents.admin.get(`/api/exceptions/${HERO_EXC}/chain`);
    expect(body.chain.map((s: { step: string }) => s.step)).toEqual([
      'REGULATION', 'REQUIREMENT', 'CONTROL', 'TEST', 'TRANSACTION', 'EXCEPTION', 'REMEDIATION', 'EVIDENCE',
    ]);
  });

  it('lists the organization and regulatory sources', async () => {
    const org = await agents.admin.get('/api/organization');
    expect(org.body.users).toHaveLength(7);
    expect(org.body.users.every((u: object) => !('password_hash' in u))).toBe(true);
    expect((await agents.admin.get('/api/regulatory/sources')).body.sources).toHaveLength(2);
  });
});

describe('exception workflow', () => {
  it('walks the hero exception OPEN -> VERIFIED with evidence and segregation of duties', async () => {
    const move = (who: string, to: string) => agents[who].post(`/api/exceptions/${HERO_EXC}/transition`).send({ to_status: to });
    expect((await move('ops', 'RESOLVED')).status).toBe(400); // illegal jump
    expect((await move('ops', 'IN_REVIEW')).status).toBe(200);
    expect((await move('ops', 'REMEDIATION')).status).toBe(200);
    expect((await move('ops', 'RESOLVED')).body.detail).toMatch(/evidence/);

    const exc = (await agents.ops.get(`/api/exceptions/${HERO_EXC}`)).body.exception;
    const ev = await agents.ops.post('/api/evidence').send({
      name: 'Bank statement', evidence_type: 'DOCUMENT', content: 'Shortfall of PHP 500 refunded',
      exception_id: exc.id, control_id: exc.control_id, transaction_id: exc.transaction_id,
    });
    expect(ev.status).toBe(200);
    expect(ev.body.evidence.content_hash).toMatch(/^[0-9a-f]{64}$/);
    expect((await move('ops', 'RESOLVED')).body.detail).toMatch(/remediation/);
    await agents.ops.post(`/api/exceptions/${HERO_EXC}/remediation`).send({ status: 'COMPLETED', completion_note: 'Refunded' });
    expect((await move('ops', 'RESOLVED')).status).toBe(200);

    expect((await move('ops', 'VERIFIED')).status).toBe(403); // PAYMENT_OPS can't verify
    expect((await move('compliance', 'VERIFIED')).status).toBe(200);
    const audit = await agents.compliance.get(`/api/audit-logs?entity_id=${exc.id}`);
    expect(audit.body.audit_logs.map((l: { action: string }) => l.action)).toEqual(
      expect.arrayContaining(['exception:transition', 'exception:remediation']),
    );
    const evAudit = await agents.compliance.get(`/api/audit-logs?entity_id=${ev.body.evidence.id}`);
    expect(evAudit.body.audit_logs[0]).toMatchObject({ action: 'evidence:upload', user_role: 'PAYMENT_OPS' });
  });

  it('denies every write to read-only roles with 403 (never 400)', async () => {
    const code = HERO_EXC;
    for (const who of ['auditor', 'viewer']) {
      expect((await agents[who].post(`/api/exceptions/${code}/transition`).send({ to_status: 'IN_REVIEW' })).status).toBe(403);
      expect((await agents[who].post(`/api/exceptions/${code}/transition`).send({ to_status: 'BOGUS' })).status).toBe(403);
      expect((await agents[who].post(`/api/exceptions/${code}/assign`).send({ owner_id: 'x' })).status).toBe(403);
      expect((await agents[who].post(`/api/exceptions/${code}/comment`).send({ text: 'x' })).status).toBe(403);
      expect((await agents[who].post('/api/evidence').send({ name: 'x', evidence_type: 'x' })).status).toBe(403);
      expect((await agents[who].post('/api/evidence-packages/generate').send({ period_start: '2026-01-01', period_end: '2026-03-31' })).status).toBe(403);
    }
    expect((await agents.viewer.get('/api/audit-logs')).status).toBe(403);
    expect((await agents.auditor.get('/api/audit-logs')).status).toBe(200);
  });

  it('exposes no route that edits or deletes audit logs', async () => {
    for (const method of ['put', 'patch', 'delete'] as const) {
      expect([404, 405]).toContain((await agents.admin[method]('/api/audit-logs')).status);
    }
  });
});

describe('evidence packages', () => {
  it('reproduces the same SHA-256 for the same period', async () => {
    const period = { period_start: '2026-01-01', period_end: '2026-03-31' };
    const a = await agents.compliance.post('/api/evidence-packages/generate').send(period);
    const b = await agents.compliance.post('/api/evidence-packages/generate').send(period);
    expect(a.body.package.canonical_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(b.body.package.canonical_hash).toBe(a.body.package.canonical_hash);
    expect(a.body.package.stellar).toMatchObject({ verification_status: 'NOT_SUBMITTED', transaction_hash: null, network: 'TESTNET' });
  });
});

describe('Stellar attestation (Freighter flow against the contract stand-in)', () => {
  const alice = Keypair.random(); // compliance officer's wallet
  const bob = Keypair.random(); // risk officer's wallet
  let pkg: { id: string; canonical_hash: string };

  async function linkWallet(who: string, kp: Keypair) {
    const ch = await agents[who].post('/api/stellar/wallet/challenge').send({ address: kp.publicKey() });
    const signature = Buffer.from(kp.signMessage(ch.body.message)).toString('base64');
    return agents[who].post('/api/stellar/wallet/link').send({ challenge: ch.body.challenge, signature });
  }

  async function signAndSubmit(who: string, prep: { xdr: string; network_passphrase: string; pending_id: string }, kp: Keypair) {
    const tx = TransactionBuilder.fromXDR(prep.xdr, prep.network_passphrase);
    tx.sign(kp);
    return agents[who].post('/api/stellar/submit').send({ pending_id: prep.pending_id, signed_xdr: tx.toXDR() });
  }

  beforeAll(async () => {
    const gen = await agents.compliance.post('/api/evidence-packages/generate').send({ period_start: '2026-02-01', period_end: '2026-02-28' });
    pkg = gen.body.package;
  });

  it('links wallets only with a valid signature from that account', async () => {
    const ch = await agents.compliance.post('/api/stellar/wallet/challenge').send({ address: alice.publicKey() });
    const forged = Buffer.from(bob.signMessage(ch.body.message)).toString('base64');
    expect((await agents.compliance.post('/api/stellar/wallet/link').send({ challenge: ch.body.challenge, signature: forged })).status).toBe(400);

    const linked = await linkWallet('compliance', alice);
    expect(linked.body).toMatchObject({ address: alice.publicKey(), is_signer: false });
    expect((await linkWallet('risk', alice)).status).toBe(409);
    expect((await linkWallet('risk', bob)).status).toBe(200);
  });

  it('shows admins which linked wallets still need add_signer', async () => {
    expect((await agents.compliance.get('/api/stellar/signers')).status).toBe(403);
    const { body } = await agents.admin.get('/api/stellar/signers');
    expect(body.pending_count).toBe(2);
    expect(body.script_command).toBe(
      `CONTRACT_ID=${body.contract_id} ORG=${DEMO_ORG_ID} NETWORK=testnet ./contracts/scripts/authorize-signers.sh ` +
        body.wallets.map((w: { address: string }) => w.address).join(' '),
    );
    const maria = body.wallets.find((w: { role: string }) => w.role === 'COMPLIANCE');
    expect(maria).toMatchObject({ address: alice.publicKey(), is_signer: false });
    expect(maria.command).toContain(`add_signer --org ${DEMO_ORG_ID} --signer ${alice.publicKey()}`);
  });

  it('refuses to prepare an attestation for a wallet the contract has not authorized', async () => {
    const res = await agents.compliance.post(`/api/stellar/packages/${pkg.id}/attest/prepare`);
    expect(res.status).toBe(400);
    expect(res.body.detail).toMatch(/not an authorized signer/);
    soroban.signers.add(`${DEMO_ORG_ID}|${alice.publicKey()}`);
    soroban.signers.add(`${DEMO_ORG_ID}|${bob.publicKey()}`);
    expect((await agents.compliance.get('/api/stellar/wallet')).body.is_signer).toBe(true);
    const after = (await agents.admin.get('/api/stellar/signers')).body;
    expect(after).toMatchObject({ pending_count: 0, script_command: null });
  });

  it('attests, rejects swapped envelopes, and blocks double submits', async () => {
    const prep = (await agents.compliance.post(`/api/stellar/packages/${pkg.id}/attest/prepare`)).body;
    const other = (await agents.compliance.post(`/api/stellar/packages/${pkg.id}/attest/prepare`)).body;
    expect((await signAndSubmit('compliance', { ...other, pending_id: prep.pending_id }, alice)).status).toBe(400);
    expect((await agents.risk.post('/api/stellar/submit').send({ pending_id: prep.pending_id, signed_xdr: prep.xdr })).status).toBe(404);

    const res = await signAndSubmit('compliance', prep, alice);
    expect(res.status).toBe(200);
    expect(res.body.attestation).toMatchObject({ version: 1, verification_status: 'ATTESTED', attester_address: alice.publicKey() });
    expect((await signAndSubmit('compliance', prep, alice)).status).toBe(409);
    expect((await agents.compliance.post(`/api/stellar/packages/${pkg.id}/attest/prepare`)).status).toBe(409);
  });

  it('enforces roles and segregation of duties on countersign', async () => {
    expect((await agents.auditor.post(`/api/stellar/packages/${pkg.id}/attest/prepare`)).status).toBe(403);
    expect((await agents.ops.post(`/api/stellar/packages/${pkg.id}/countersign/prepare`)).status).toBe(403);
    expect((await agents.compliance.post(`/api/stellar/packages/${pkg.id}/countersign/prepare`)).status).toBe(403);

    const prep = (await agents.risk.post(`/api/stellar/packages/${pkg.id}/countersign/prepare`)).body;
    const res = await signAndSubmit('risk', prep, bob);
    expect(res.status).toBe(200);
    expect(res.body.attestation).toMatchObject({ verification_status: 'VERIFIED', verifier_address: bob.publicKey() });
  });

  it('verifies publicly and reflects status on the package list', async () => {
    const v = await request(app.getHttpServer()).get(`/api/stellar/verify/${pkg.canonical_hash}`);
    expect(v.body).toMatchObject({ found: true, package: { id: pkg.id } });
    expect(v.body.onchain).toMatchObject({ attester: alice.publicKey(), verifier: bob.publicKey(), version: 1 });
    expect((await request(app.getHttpServer()).get(`/api/stellar/verify/${'0'.repeat(64)}`)).body.found).toBe(false);
    expect((await request(app.getHttpServer()).get('/api/stellar/verify/not-a-hash')).status).toBe(400);

    const list = await agents.auditor.get('/api/evidence-packages');
    const p = list.body.packages.find((x: { id: string }) => x.id === pkg.id);
    expect(p.stellar).toMatchObject({ verification_status: 'VERIFIED', hash_matches_package: true });
  });

  it('rebuilds local records from chain state', async () => {
    const res = await agents.compliance.post(`/api/stellar/packages/${pkg.id}/sync`);
    expect(res.body.attestations).toHaveLength(1);
    expect(res.body.attestations[0]).toMatchObject({ verification_status: 'VERIFIED', attester_name: 'Maria Reyes' });
  });
});

describe('HTTP hardening', () => {
  const http = () => request(app.getHttpServer());

  it('sends security headers and hides the framework', async () => {
    const res = await http().get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('blocks state-changing requests from other origins (CSRF)', async () => {
    const evil = await agents.ops.post(`/api/exceptions/${HERO_EXC}/comment`).set('Origin', 'https://evil.example').send({ text: 'x' });
    expect(evil.status).toBe(403);
    const own = await agents.ops.post(`/api/exceptions/${HERO_EXC}/comment`).set('Origin', 'http://localhost:3000').send({ text: 'ok' });
    expect(own.status).toBe(200);
  });

  it('ignores HTML form posts (JSON bodies only)', async () => {
    const res = await http().post('/api/auth/login').type('form').send(ADMIN);
    expect(res.status).toBe(422);
  });

  it('rejects oversized bodies', async () => {
    const res = await agents.ops.post(`/api/exceptions/${HERO_EXC}/comment`).send({ text: 'x'.repeat(200_000) });
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ detail: 'Request body too large.' });
    const bad = await http().post('/api/auth/login').set('Content-Type', 'application/json').send('{"email":');
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual({ detail: 'Malformed JSON body.' });
  });

  it('issues SameSite=Lax httpOnly session cookies by default', async () => {
    const res = await http().post('/api/auth/login').send(ADMIN);
    const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('access_token='))!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
  });

  it('rate-limits credential endpoints', async () => {
    process.env.RATE_LIMIT = 'on';
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 12; i++) {
        statuses.push((await http().post('/api/auth/forgot-password').send({ email: `probe${i}@example.com` })).status);
      }
      expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
      expect(statuses.slice(10)).toEqual([429, 429]);
    } finally {
      process.env.RATE_LIMIT = 'off';
    }
  });
});

describe('key custody', () => {
  it('never loads a Stellar secret key in application code', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.spec.ts') ? [] : [join(dir, e.name)]);
    for (const file of walk(join(__dirname, '../src'))) {
      const src = readFileSync(file, 'utf8');
      expect(src).not.toMatch(/Keypair\.fromSecret|STELLAR_SECRET|\.sign\(\s*Keypair/);
    }
  });
});
