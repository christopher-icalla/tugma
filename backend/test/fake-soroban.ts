import { BadRequestException } from '@nestjs/common';
import { Account, BASE_FEE, Keypair, Transaction, TransactionBuilder, xdr, scValToNative } from '@stellar/stellar-sdk';
import { createHash } from 'node:crypto';
import { AccountSigners, CONTRACT_ERRORS, OnChainAttestation, SorobanService, StaleTransactionError, SubmitResult } from '../src/stellar/soroban.service';

/** A classic account with extra signers, as the ledger would enforce it. */
type FakeAccount = { sequence: bigint; masterWeight: number; signers: Map<string, number>; thresholds: { low: number; med: number; high: number } };

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
  /** Transaction hash of each attestation, keyed like `records`: what the RPC's Attested event carries. */
  private txHashes = new Map<string, string>();
  /** Set to make event lookups behave as if the ledger is past the RPC's retention window. */
  eventsExpired = false;
  /** Multisig accounts (the two-party attestation account). Transactions from them need signatures meeting their thresholds. */
  accounts = new Map<string, FakeAccount>();
  /** Overrides "now" for time-bound checks at submit. */
  now = () => Date.now();

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

  /** The decoded contract-call arguments of a transaction this stand-in prepared. */
  preparedArgs(xdrB64: string, passphrase: string): unknown[] {
    const tx = TransactionBuilder.fromXDR(xdrB64, passphrase) as Transaction;
    return this.prepared.get(Buffer.from(tx.hash()).toString('hex'))?.args ?? [];
  }

  async findAttestTxHash(org: string, pkg: string, version: number, hash: string, ledger: number) {
    const rec = this.records.get(this.key(org, pkg, version));
    if (this.eventsExpired || !rec || rec.hash !== hash || rec.attested_ledger !== ledger) return null;
    return this.txHashes.get(this.key(org, pkg, version)) ?? null;
  }

  async accountSequence(address: string) {
    return String(this.accounts.get(address)?.sequence ?? 0n);
  }

  async accountSigners(address: string): Promise<AccountSigners | null> {
    const a = this.accounts.get(address);
    if (!a) return null;
    return {
      account_id: address, sequence: String(a.sequence), master_weight: a.masterWeight, thresholds: { ...a.thresholds },
      signers: [...a.signers].map(([key, weight]) => ({ key, weight })),
    };
  }

  async prepare(source: string, method: string, ...args: xdr.ScVal[]): Promise<Transaction> {
    return this.prepareTimed(source, 300, method, ...args);
  }

  async prepareTimed(source: string, timeoutSeconds: number, method: string, ...args: xdr.ScVal[]): Promise<Transaction> {
    const native = args.map((a) => scValToNative(a));
    this.apply(source, method, native, true);
    const multisig = this.accounts.get(source);
    const sequence = multisig ? String(multisig.sequence) : String(++this.sequence);
    const tx = new TransactionBuilder(new Account(source, sequence), { fee: BASE_FEE, networkPassphrase: this.networkPassphrase })
      .addOperation(this.contract.call(method, ...args))
      .setTimeout(timeoutSeconds)
      .build();
    this.prepared.set(Buffer.from(tx.hash()).toString('hex'), { method, args: native });
    return tx;
  }

  /** What the network checks for a multisig source: sequence, time bounds, then signature weight against the thresholds. */
  private checkMultisig(tx: Transaction, a: FakeAccount, staleAware: boolean) {
    const stale = (reason: 'sequence' | 'expired') => {
      if (staleAware) throw new StaleTransactionError(reason, reason === 'sequence' ? 'txBadSeq' : 'txTooLate');
      throw new BadRequestException(`FakeSoroban: ${reason === 'sequence' ? 'txBadSeq' : 'txTooLate'}`);
    };
    if (BigInt(tx.sequence) !== a.sequence + 1n) stale('sequence');
    const maxTime = Number(tx.timeBounds?.maxTime ?? 0);
    if (maxTime && Math.floor(this.now() / 1000) > maxTime) stale('expired');
    const keys = new Map([...a.signers, [tx.source, a.masterWeight]]);
    let weight = 0;
    for (const [key, w] of keys) {
      if (tx.signatures.some((s) => Keypair.fromPublicKey(key).verify(tx.hash(), s.signature))) weight += w;
    }
    if (weight < Math.max(a.thresholds.low, a.thresholds.med)) throw new BadRequestException('FakeSoroban: txBadAuth (signature weight below the threshold)');
  }

  async submit(tx: Transaction, opts: { staleAware?: boolean } = {}): Promise<SubmitResult> {
    const call = this.prepared.get(Buffer.from(tx.hash()).toString('hex'));
    if (!call) throw new BadRequestException('FakeSoroban: unknown transaction');
    const multisig = this.accounts.get(tx.source);
    if (multisig) {
      this.checkMultisig(tx, multisig, !!opts.staleAware);
      multisig.sequence += 1n;
    } else if (!tx.signatures.some((s) => Keypair.fromPublicKey(tx.source).verify(tx.hash(), s.signature))) {
      throw new BadRequestException('FakeSoroban: missing source signature');
    }
    const returnValue = this.apply(tx.source, call.method, call.args, false);
    const hash = createHash('sha256').update(tx.toXDR()).digest('hex');
    if (call.method === 'attest') {
      const [, org, pkg] = call.args as [string, string, string];
      this.txHashes.set(this.key(org, pkg, Number(returnValue)), hash);
    }
    return { hash, ledger: ++this.ledger, returnValue };
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
