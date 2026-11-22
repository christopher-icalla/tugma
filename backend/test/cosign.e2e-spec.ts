/**
 * Two-party (multisig) attestation, end to end against the contract stand-in.
 * The feature is on in this file only: its MULTISIG_* settings use throwaway
 * keys generated here (test/setup-env.ts clears them for every other file).
 */
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Keypair, Memo, Networks, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DEMO_ORG_ID } from '../src/config';
import { configureApp } from '../src/main';
import { PrismaService } from '../src/prisma.service';
import { SeedService } from '../src/seed/seed.service';
import { SorobanService } from '../src/stellar/soroban.service';
import { FakeSoroban } from './fake-soroban';

const tugma = Keypair.random();
const reviewer = Keypair.random();
const account = Keypair.random().publicKey(); // the attestation account; its master key is never used
process.env.MULTISIG_ATTESTATION_ACCOUNT = account;
process.env.MULTISIG_TUGMA_SIGNER_SECRET = tugma.secret();
process.env.MULTISIG_REVIEWER_PUBLIC_KEY = reviewer.publicKey();

let app: NestExpressApplication;
let soroban: FakeSoroban;
let prisma: PrismaService;
let chainOrg: string;
const agents: Record<string, request.Agent> = {};
const anon = () => request(app.getHttpServer());

type Req = { id: string; status: string; xdr: string; tx_hash: string; network_passphrase: string };

const twoOfTwo = () => ({
  sequence: 1000n, masterWeight: 0,
  signers: new Map([[tugma.publicKey(), 1], [reviewer.publicKey(), 1]]),
  thresholds: { low: 2, med: 2, high: 2 },
});

function signAs(xdrB64: string, kp: Keypair) {
  const tx = TransactionBuilder.fromXDR(xdrB64, Networks.TESTNET) as Transaction;
  tx.sign(kp);
  return tx.toXDR();
}

async function generate(start: string, end: string) {
  const res = await agents.compliance.post('/api/evidence-packages/generate').send({ period_start: start, period_end: end });
  expect(res.status).toBe(200);
  return res.body.package as { id: string; canonical_hash: string };
}

async function requestCosign(pkgId: string): Promise<Req> {
  const res = await agents.compliance.post(`/api/stellar/packages/${pkgId}/cosign/request`);
  expect(res.status).toBe(200);
  return res.body.request;
}

const submit = (id: string, signed_xdr: string) => anon().post(`/api/stellar/cosign/${id}/submit`).send({ signed_xdr });

beforeAll(async () => {
  soroban = new FakeSoroban();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(SorobanService).useValue(soroban).compile();
  app = configureApp(moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false }));
  await app.init();
  await app.get(SeedService).run();
  prisma = app.get(PrismaService);
  for (const role of ['compliance', 'viewer']) {
    const agent = request.agent(app.getHttpServer());
    expect((await agent.post('/api/auth/login').send({ email: `${role}@tugmademo.ph`, password: process.env.DEMO_USER_PASSWORD })).status).toBe(200);
    agents[role] = agent;
  }
  chainOrg = (await prisma.organization.findUniqueOrThrow({ where: { id: DEMO_ORG_ID } })).chain_org_id;
  soroban.accounts.set(account, twoOfTwo());
});

afterAll(async () => {
  await app?.close();
  for (const key of ['MULTISIG_ATTESTATION_ACCOUNT', 'MULTISIG_TUGMA_SIGNER_SECRET', 'MULTISIG_REVIEWER_PUBLIC_KEY']) delete process.env[key];
});

describe('two-party attestation', () => {
  let pkg: { id: string; canonical_hash: string };
  let req: Req;

  beforeAll(async () => {
    pkg = await generate('2025-01-01', '2025-01-31');
  });

  it('publishes the attestation account and both public keys, never a secret', async () => {
    const res = await anon().get('/api/stellar/config');
    expect(res.body.multisig).toEqual({ attestation_account: account, tugma_signer: tugma.publicKey(), reviewer_signer: reviewer.publicKey(), ttl_hours: 24 });
    expect(JSON.stringify(res.body)).not.toContain(tugma.secret());
  });

  it('refuses to build for an account that does not need both keys, or is not authorized on the contract', async () => {
    soroban.accounts.set(account, { ...twoOfTwo(), thresholds: { low: 1, med: 1, high: 1 } });
    const weak = await agents.compliance.post(`/api/stellar/packages/${pkg.id}/cosign/request`);
    expect(weak.status).toBe(400);
    expect(weak.body.detail).toMatch(/does not require both/);
    soroban.accounts.set(account, twoOfTwo());

    const unauthorized = await agents.compliance.post(`/api/stellar/packages/${pkg.id}/cosign/request`);
    expect(unauthorized.status).toBe(400);
    expect(unauthorized.body.detail).toMatch(/not an authorized signer/);
    soroban.signers.add(`${chainOrg}|${account}`);

    expect((await agents.viewer.post(`/api/stellar/packages/${pkg.id}/cosign/request`)).status).toBe(403);
  });

  it('builds the attestation, signs it as TUGMA only, and stores it as awaiting the reviewer', async () => {
    req = await requestCosign(pkg.id);
    expect(req.status).toBe('AWAITING_REVIEWER');
    const tx = TransactionBuilder.fromXDR(req.xdr, Networks.TESTNET) as Transaction;
    expect(tx.source).toBe(account);
    expect(tx.signatures).toHaveLength(1);
    expect(tugma.verify(tx.hash(), tx.signatures[0].signature)).toBe(true);
    // Long enough for a person: 24 hours by default.
    const hours = (Number(tx.timeBounds!.maxTime) * 1000 - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThanOrEqual(24);
    // attest(attester, org, ...): the attestation account is both the attester and the source.
    const args = soroban.preparedArgs(req.xdr, Networks.TESTNET);
    expect(args[0]).toBe(account);
    expect(args[1]).toBe(chainOrg);

    // The network would not take it with TUGMA's signature alone.
    await expect(soroban.submit(tx)).rejects.toThrow(/txBadAuth/);

    // Asking again while it waits returns the same request.
    expect((await requestCosign(pkg.id)).id).toBe(req.id);
    const listed = (await agents.compliance.get('/api/evidence-packages')).body.packages.find((p: { id: string }) => p.id === pkg.id);
    expect(listed.cosign).toMatchObject({ id: req.id, status: 'AWAITING_REVIEWER', reviewer_signer: reviewer.publicKey() });
    expect(listed.stellar.verification_status).toBe('NOT_SUBMITTED');
  });

  it('shows the reviewer, without a login, exactly what is being signed', async () => {
    const res = await anon().get(`/api/stellar/cosign/${req.id}`);
    expect(res.status).toBe(200);
    expect(res.body.request).toMatchObject({
      status: 'AWAITING_REVIEWER', attestation_account: account, tugma_signer: tugma.publicKey(), reviewer_signer: reviewer.publicKey(),
      network: 'TESTNET', network_passphrase: Networks.TESTNET, xdr: req.xdr,
      package: { id: pkg.id, canonical_hash: pkg.canonical_hash, expected_version: 1, period_start: '2025-01-01' },
    });
    expect(res.body.request.requested_by_name).toBeUndefined();
    expect((await anon().get('/api/stellar/cosign/not-a-uuid')).status).toBe(400);
    expect((await anon().get('/api/stellar/cosign/00000000-0000-4000-8000-000000000000')).status).toBe(404);
  });

  it('rejects a signature from the wrong key, an extra signature, and a modified envelope', async () => {
    const stranger = Keypair.random();
    const wrong = await submit(req.id, signAs(req.xdr, stranger));
    expect(wrong.status).toBe(400);
    expect(wrong.body.detail).toMatch(/not from the reviewer key/);

    const extra = await submit(req.id, signAs(signAs(req.xdr, reviewer), stranger));
    expect(extra.status).toBe(400);

    const unsignedByReviewer = await submit(req.id, req.xdr);
    expect(unsignedByReviewer.status).toBe(400);
    expect(unsignedByReviewer.body.detail).toMatch(/not signed by the reviewer key/);

    // Same call with a higher fee and a memo: a different transaction, even if the reviewer signs it.
    const original = TransactionBuilder.fromXDR(req.xdr, Networks.TESTNET) as Transaction;
    const modified = TransactionBuilder.cloneFrom(original, { fee: String(Number(original.fee) + 100), memo: Memo.text('changed') }).build();
    expect(modified.sequence).toBe(original.sequence);
    modified.sign(reviewer);
    const changed = await submit(req.id, modified.toXDR());
    expect(changed.status).toBe(400);
    expect(changed.body.detail).toMatch(/differs from the one TUGMA prepared/);

    // Nothing was submitted.
    expect(await prisma.stellarAttestation.findUnique({ where: { attestation_hash: pkg.canonical_hash } })).toBeNull();
  });

  it('submits once the reviewer signs, records both signers, and refuses a second submit', async () => {
    const res = await submit(req.id, signAs(req.xdr, reviewer));
    expect(res.status).toBe(200);
    expect(res.body.attestation).toMatchObject({
      version: 1, verification_status: 'CO_SIGNED', attester_address: account,
      multisig_signers: [{ role: 'tugma', key: tugma.publicKey() }, { role: 'reviewer', key: reviewer.publicKey() }],
    });
    expect(res.body.request).toMatchObject({ status: 'CO_SIGNED', version: 1, xdr: null });
    expect(res.body.request.submitted_tx_hash).toBe(res.body.attestation.transaction_hash);
    expect((await submit(req.id, signAs(req.xdr, reviewer))).status).toBe(409);

    const onchain = await soroban.verify(pkg.canonical_hash);
    expect(onchain).toMatchObject({ attester: account, version: 1 });

    const listed = (await agents.compliance.get('/api/evidence-packages')).body.packages.find((p: { id: string }) => p.id === pkg.id);
    expect(listed.stellar).toMatchObject({ verification_status: 'CO_SIGNED', hash_matches_package: true });
    expect(listed.cosign.status).toBe('CO_SIGNED');
    // Both parties have signed: it does not wait for a countersignature.
    const followUps = (await agents.viewer.get('/api/follow-ups')).body;
    expect(followUps.awaiting_countersign.map((a: { evidence_package_id: string }) => a.evidence_package_id)).not.toContain(pkg.id);
  });

  it('shows both signing steps on the timeline, and keeps CO_SIGNED on a sync from chain', async () => {
    const { body } = await agents.viewer.get(`/api/evidence-packages/${pkg.id}/timeline`);
    const titles = body.events.map((e: { title: string }) => e.title);
    expect(titles).toEqual(expect.arrayContaining([
      'Signed by TUGMA, awaiting reviewer signature', 'Signed by the independent reviewer',
      'Version 1 attested on Stellar by TUGMA and the reviewer (2-of-2)',
    ]));
    const attested = body.events.find((e: { kind: string }) => e.kind === 'attested');
    expect(attested.actor).toContain(tugma.publicKey());
    expect(attested.actor).toContain(reviewer.publicKey());

    await prisma.stellarAttestation.deleteMany({ where: { evidence_package_id: pkg.id } });
    const synced = await agents.compliance.post(`/api/stellar/packages/${pkg.id}/sync`);
    expect(synced.body.attestations[0]).toMatchObject({
      verification_status: 'CO_SIGNED', attester_name: 'TUGMA + independent reviewer',
      multisig_signers: [{ role: 'tugma', key: tugma.publicKey() }, { role: 'reviewer', key: reviewer.publicKey() }],
    });
  });

  it('says clearly when the sequence number went stale, and lets TUGMA rebuild for a fresh signature', async () => {
    const p2 = await generate('2025-02-01', '2025-02-28');
    const first = await requestCosign(p2.id);
    soroban.accounts.get(account)!.sequence += 1n; // another transaction from the account landed meanwhile

    const res = await submit(first.id, signAs(first.xdr, reviewer));
    expect(res.status).toBe(409);
    expect(res.body.detail).toMatch(/sequence number is used.*rebuild/i);
    expect((await anon().get(`/api/stellar/cosign/${first.id}`)).body.request).toMatchObject({ status: 'STALE', xdr: null });
    expect((await submit(first.id, signAs(first.xdr, reviewer))).status).toBe(409);

    expect((await agents.viewer.post(`/api/stellar/cosign/${first.id}/rebuild`)).status).toBe(403);
    const rebuilt = await agents.compliance.post(`/api/stellar/cosign/${first.id}/rebuild`);
    expect(rebuilt.status).toBe(200);
    const second: Req = rebuilt.body.request;
    expect(second.id).not.toBe(first.id);
    expect(second.tx_hash).not.toBe(first.tx_hash);
    expect((await anon().get(`/api/stellar/cosign/${first.id}`)).body.request.status).toBe('SUPERSEDED');

    const ok = await submit(second.id, signAs(second.xdr, reviewer));
    expect(ok.status).toBe(200);
    expect(ok.body.attestation).toMatchObject({ verification_status: 'CO_SIGNED', attestation_hash: p2.canonical_hash });
    expect((await agents.compliance.post(`/api/stellar/cosign/${second.id}/rebuild`)).status).toBe(409);
  });

  it('marks a request stale when it expired, whether TUGMA or the network notices first', async () => {
    const p3 = await generate('2025-03-01', '2025-03-31');
    const late = await requestCosign(p3.id);
    await prisma.stellarCosignRequest.update({ where: { id: late.id }, data: { expires_at: new Date(Date.now() - 1000) } });
    const res = await submit(late.id, signAs(late.xdr, reviewer));
    expect(res.status).toBe(409);
    expect(res.body.detail).toMatch(/expired.*rebuild/i);
    const listed = (await agents.compliance.get('/api/evidence-packages')).body.packages.find((p: { id: string }) => p.id === p3.id);
    expect(listed.cosign).toMatchObject({ id: late.id, status: 'STALE' });

    // The network's own clock: the transaction's time bounds passed (txTooLate).
    const again = (await agents.compliance.post(`/api/stellar/cosign/${late.id}/rebuild`)).body.request as Req;
    soroban.now = () => Date.now() + 25 * 3_600_000;
    try {
      const tooLate = await submit(again.id, signAs(again.xdr, reviewer));
      expect(tooLate.status).toBe(409);
      expect(tooLate.body.detail).toBe('txTooLate');
      expect((await anon().get(`/api/stellar/cosign/${again.id}`)).body.request.status).toBe('STALE');
    } finally {
      soroban.now = () => Date.now();
    }
    expect(await prisma.stellarAttestation.findUnique({ where: { attestation_hash: p3.canonical_hash } })).toBeNull();
  });
});
