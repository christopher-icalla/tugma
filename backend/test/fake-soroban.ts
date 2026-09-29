import { BadRequestException } from '@nestjs/common';
import { Account, BASE_FEE, Keypair, Transaction, TransactionBuilder, xdr, scValToNative } from '@stellar/stellar-sdk';
import { createHash } from 'node:crypto';
import { CONTRACT_ERRORS, OnChainAttestation, SorobanService, SubmitResult } from '../src/stellar/soroban.service';

/**
 * In-memory stand-in for the attestation contract, so the API's prepare ->
 * sign -> submit flow runs in CI without testnet. It reproduces the contract's
 * rules (signer allow-list, unique hashes, versioning, no self-countersign).
 * The real network path is exercised manually against testnet.
 */
export class FakeSoroban extends SorobanService {
  signers = new Set<string>();
  private records = new Map<string, OnChainAttestation>();
  private prepared = new Map<string, { method: string; args: unknown[] }>();
  private ledger = 1000;
  private sequence = 1;

  private key = (org: string, pkg: string, v: number) => `${org}|${pkg}|${v}`;

  async isSigner(org: string, address: string) {
    return this.signers.has(`${org}|${address}`);
  }

  async get(org: string, pkg: string, version: number) {
    return this.records.get(this.key(org, pkg, version)) ?? null;
  }

  async versionCount(org: string, pkg: string) {
    return [...this.records.values()].filter((r) => r.org === org && r.package_id === pkg).length;
  }

  async verify(hash: string) {
    return [...this.records.values()].find((r) => r.hash === hash) ?? null;
  }

  async prepare(source: string, method: string, ...args: xdr.ScVal[]): Promise<Transaction> {
    const native = args.map((a) => scValToNative(a));
    this.apply(source, method, native, true);
    const tx = new TransactionBuilder(new Account(source, String(++this.sequence)), { fee: BASE_FEE, networkPassphrase: this.networkPassphrase })
      .addOperation(this.contract.call(method, ...args))
      .setTimeout(300)
      .build();
    this.prepared.set(Buffer.from(tx.hash()).toString('hex'), { method, args: native });
    return tx;
  }

  async submit(tx: Transaction): Promise<SubmitResult> {
    const call = this.prepared.get(Buffer.from(tx.hash()).toString('hex'));
    if (!call) throw new BadRequestException('FakeSoroban: unknown transaction');
    if (!tx.signatures.some((s) => Keypair.fromPublicKey(tx.source).verify(tx.hash(), s.signature))) {
      throw new BadRequestException('FakeSoroban: missing source signature');
    }
    const returnValue = this.apply(tx.source, call.method, call.args, false);
    return { hash: createHash('sha256').update(tx.toXDR()).digest('hex'), ledger: ++this.ledger, returnValue };
  }

  private apply(source: string, method: string, args: unknown[], dryRun: boolean): unknown {
    const fail = (code: number): never => {
      throw new BadRequestException(CONTRACT_ERRORS[code]);
    };
    if (method === 'attest') {
      const [attester, org, pkg, start, end, hash] = args as [string, string, string, string, string, Buffer];
      if (attester !== source || !this.signers.has(`${org}|${attester}`)) fail(1);
      const hex = Buffer.from(hash).toString('hex');
      if ([...this.records.values()].some((r) => r.hash === hex)) fail(2);
      const version = [...this.records.values()].filter((r) => r.org === org && r.package_id === pkg).length + 1;
      if (!dryRun) {
        this.records.set(this.key(org, pkg, version), {
          org, package_id: pkg, version, hash: hex, period_start: start, period_end: end, attester,
          attested_at: new Date().toISOString(), attested_ledger: this.ledger + 1, verifier: null, verified_at: null,
        });
      }
      return version;
    }
    if (method === 'countersign') {
      const [verifier, org, pkg, version] = args as [string, string, string, number];
      if (verifier !== source || !this.signers.has(`${org}|${verifier}`)) fail(1);
      const rec = this.records.get(this.key(org, pkg, Number(version))) ?? fail(3);
      if (rec.verifier) fail(4);
      if (rec.attester === verifier) fail(5);
      if (!dryRun) Object.assign(rec, { verifier, verified_at: new Date().toISOString() });
      return null;
    }
    throw new Error(`FakeSoroban: unsupported method ${method}`);
  }
}
