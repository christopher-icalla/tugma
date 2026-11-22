/**
 * Thin client for the TUGMA attestation registry contract (contracts/).
 *
 * The API never holds signing keys: it builds and simulates transactions for a
 * user's wallet (Freighter) to sign, submits the signed envelope, and reads
 * contract state through simulation.
 */
import { BadRequestException, BadGatewayException, ConflictException, Injectable, Logger } from '@nestjs/common';
import {
  Account, Address, BASE_FEE, Contract, FeeBumpTransaction, Keypair, nativeToScVal, rpc, scValToNative,
  StrKey, Transaction, TransactionBuilder, xdr,
} from '@stellar/stellar-sdk';
import { config } from '../config';

/** Contract error codes (contracts/contracts/attestation/src/lib.rs). */
export const CONTRACT_ERRORS: Record<number, string> = {
  1: 'This wallet is not an authorized signer for the organization on-chain. Ask the contract admin to run add_signer for it.',
  2: 'This package hash is already attested on-chain.',
  3: 'Attestation not found on-chain.',
  4: 'This attestation version is already countersigned.',
  5: 'Segregation of duties: the countersigning wallet must differ from the attesting wallet.',
};

export type OnChainAttestation = {
  org: string;
  package_id: string;
  version: number;
  hash: string;
  period_start: string;
  period_end: string;
  attester: string;
  attested_at: string;
  attested_ledger: number;
  verifier: string | null;
  verified_at: string | null;
};

export type SubmitResult = { hash: string; ledger: number; returnValue: unknown };

/** A Stellar account's signers and thresholds, as the ledger holds them. */
export type AccountSigners = {
  account_id: string;
  sequence: string;
  master_weight: number;
  thresholds: { low: number; med: number; high: number };
  signers: { key: string; weight: number }[];
};

/**
 * The network refused a transaction because it can no longer be valid: its
 * sequence number was used or overtaken (txBadSeq), or its time bounds passed
 * (txTooLate). Signing it again won't help; it has to be rebuilt.
 */
export class StaleTransactionError extends ConflictException {
  constructor(
    readonly reason: 'sequence' | 'expired',
    message: string,
  ) {
    super(message);
  }
}

// Any syntactically valid account works as the source of a read-only simulation.
const SIMULATION_SOURCE = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

export const str = (v: string) => nativeToScVal(v, { type: 'string' });
export const u32 = (v: number) => nativeToScVal(v, { type: 'u32' });
export const addr = (v: string) => new Address(v).toScVal();
export const bytes32 = (hex: string) => {
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new BadRequestException('Hash must be 64 hex characters (SHA-256).');
  return xdr.ScVal.scvBytes(Buffer.from(hex, 'hex'));
};

export const isAccountId = (v: string) => StrKey.isValidEd25519PublicKey(v);

@Injectable()
export class SorobanService {
  private readonly logger = new Logger(SorobanService.name);
  private readonly server: rpc.Server;
  readonly contract: Contract;
  readonly networkPassphrase: string;

  constructor() {
    const cfg = config();
    this.server = new rpc.Server(cfg.STELLAR_RPC_URL, { allowHttp: cfg.STELLAR_RPC_URL.startsWith('http://') });
    this.contract = new Contract(cfg.STELLAR_CONTRACT_ID);
    this.networkPassphrase = cfg.STELLAR_NETWORK_PASSPHRASE;
  }

  get contractId() {
    return this.contract.contractId();
  }

  // --------------------------------------------------------------- reads

  private async read(method: string, ...args: xdr.ScVal[]): Promise<unknown> {
    const tx = new TransactionBuilder(new Account(SIMULATION_SOURCE, '0'), {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(this.contract.call(method, ...args))
      .setTimeout(30)
      .build();
    const sim = await this.rpc(() => this.server.simulateTransaction(tx));
    if (rpc.Api.isSimulationError(sim)) {
      const code = contractErrorCode(sim.error);
      if (code === 3) return null;
      throw new BadGatewayException(code ? CONTRACT_ERRORS[code] : `Contract read ${method} failed: ${sim.error}`);
    }
    return sim.result ? scValToNative(sim.result.retval) : null;
  }

  async isSigner(org: string, address: string): Promise<boolean> {
    return Boolean(await this.read('is_signer', str(org), addr(address)));
  }

  async verify(hashHex: string): Promise<OnChainAttestation | null> {
    return normalizeAttestation(await this.read('verify', bytes32(hashHex)));
  }

  async get(org: string, packageId: string, version: number): Promise<OnChainAttestation | null> {
    return normalizeAttestation(await this.read('get', str(org), str(packageId), u32(version)));
  }

  async versionCount(org: string, packageId: string): Promise<number> {
    return Number((await this.read('version_count', str(org), str(packageId))) ?? 0);
  }

  /**
   * The hash of the transaction that attested `version` of a package. Contract
   * state keeps only the ledger, so this reads the `Attested` event the contract
   * published in that ledger (topics: name, org, package_id; data: version, hash,
   * attester) and returns its transaction hash. Null when the RPC no longer holds
   * events for that ledger (outside its retention window) or none matches.
   */
  async findAttestTxHash(org: string, packageId: string, version: number, hashHex: string, ledger: number): Promise<string | null> {
    let events: rpc.Api.GetEventsResponse;
    try {
      events = await this.server.getEvents({
        startLedger: ledger,
        endLedger: ledger + 1,
        filters: [{ type: 'contract', contractIds: [this.contractId], topics: [['*', str(org).toXDR('base64'), str(packageId).toXDR('base64')]] }],
        limit: 100,
      });
    } catch (e) {
      this.logger.warn(`getEvents for ledger ${ledger} failed: ${(e as Error).message}`);
      return null;
    }
    return attestTxHashFromEvents(events.events, version, hashHex);
  }

  // --------------------------------------------------------------- writes

  /**
   * Builds and simulates a contract call with `source` as the transaction
   * source (and therefore the authorizing account). Returns the assembled,
   * unsigned transaction for the user's wallet to sign.
   */
  async prepare(source: string, method: string, ...args: xdr.ScVal[]): Promise<Transaction> {
    return this.prepareTimed(source, 300, method, ...args);
  }

  /** prepare() with time bounds of `timeoutSeconds` from now, for transactions that wait for a second signer. */
  async prepareTimed(source: string, timeoutSeconds: number, method: string, ...args: xdr.ScVal[]): Promise<Transaction> {
    const account = await this.rpc(() => this.server.getAccount(source), (e) =>
      /not found/i.test(String(e))
        ? new BadRequestException(`Stellar account ${source} does not exist on this network yet. Fund it first (testnet: Friendbot).`)
        : undefined,
    );
    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: this.networkPassphrase })
      .addOperation(this.contract.call(method, ...args))
      .setTimeout(timeoutSeconds)
      .build();
    const sim = await this.rpc(() => this.server.simulateTransaction(tx));
    if (rpc.Api.isSimulationError(sim)) {
      const code = contractErrorCode(sim.error);
      throw new BadRequestException(code ? CONTRACT_ERRORS[code] : `Simulation failed: ${sim.error}`);
    }
    return rpc.assembleTransaction(tx, sim).build();
  }

  parseSigned(signedXdr: string): Transaction {
    let tx: Transaction | FeeBumpTransaction;
    try {
      tx = TransactionBuilder.fromXDR(signedXdr, this.networkPassphrase);
    } catch {
      throw new BadRequestException('signed_xdr is not a valid transaction envelope for this network.');
    }
    if (tx instanceof FeeBumpTransaction) throw new BadRequestException('Fee-bump envelopes are not accepted.');
    if (tx.signatures.length === 0) throw new BadRequestException('The transaction is not signed.');
    return tx;
  }

  /** The account's current sequence number. */
  async accountSequence(address: string): Promise<string> {
    const account = await this.rpc(() => this.server.getAccount(address));
    return account.sequenceNumber();
  }

  /** The account's signers, weights and thresholds, read from its ledger entry through Soroban RPC. */
  async accountSigners(address: string): Promise<AccountSigners | null> {
    let missing = false;
    const entry = await this.rpc(
      () => this.server.getAccountEntry(address),
      (e) => ((missing = /not found/i.test(String(e))) ? new BadRequestException(`Stellar account ${address} does not exist.`) : undefined),
    ).catch((e) => {
      if (missing) return null;
      throw e;
    });
    return entry ? accountSignersFromEntry(entry) : null;
  }

  /**
   * Sends a signed transaction and waits for the result. With `staleAware`, a
   * transaction the network can never accept (used sequence number, expired
   * time bounds) raises StaleTransactionError so the caller can offer a rebuild.
   */
  async submit(tx: Transaction, opts: { staleAware?: boolean } = {}): Promise<SubmitResult> {
    const sent = await this.rpc(() => this.server.sendTransaction(tx));
    if (sent.status === 'ERROR' || sent.status === 'TRY_AGAIN_LATER') {
      this.logger.warn(`sendTransaction ${sent.status}: ${sent.errorResult?.toXDR('base64') ?? ''}`);
      const code = sent.status === 'ERROR' ? resultCode(sent.errorResult) : null;
      if (opts.staleAware && code === 'txBadSeq') {
        throw new StaleTransactionError('sequence', 'The attestation account has used this sequence number already, so the transaction can no longer be accepted. Rebuild it and sign again.');
      }
      if (opts.staleAware && code === 'txTooLate') {
        throw new StaleTransactionError('expired', 'The transaction passed its time bounds before it was submitted. Rebuild it and sign again.');
      }
      throw new BadRequestException(
        sent.status === 'TRY_AGAIN_LATER'
          ? 'The Stellar network is busy. Try again in a few seconds.'
          : 'Stellar rejected the transaction. It may have expired or the account sequence changed; prepare it again.',
      );
    }
    const final = await this.rpc(() => this.server.pollTransaction(sent.hash, { attempts: 30, sleepStrategy: () => 1000 }));
    if (final.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      return {
        hash: sent.hash,
        ledger: final.ledger,
        returnValue: final.returnValue ? scValToNative(final.returnValue) : null,
      };
    }
    if (final.status === rpc.Api.GetTransactionStatus.FAILED) {
      // Calls are simulated before signing, so this means state changed in between
      // (e.g. someone else attested the same hash first).
      throw new BadRequestException(`Transaction ${sent.hash} failed on-chain. Reload and try again.`);
    }
    throw new BadGatewayException(`Transaction ${sent.hash} was submitted but not confirmed yet. Use "Sync from chain" shortly.`);
  }

  /** SEP-53: verify a message signed by a Stellar account (e.g. Freighter signMessage). */
  verifySignedMessage(address: string, message: string, signature: string): boolean {
    const candidates = [Buffer.from(signature, 'base64'), /^[0-9a-f]{128}$/i.test(signature) ? Buffer.from(signature, 'hex') : null];
    const kp = Keypair.fromPublicKey(address);
    return candidates.some((sig) => {
      if (!sig || sig.length !== 64) return false;
      try {
        return kp.verifyMessage(message, sig);
      } catch {
        return false;
      }
    });
  }

  private async rpc<T>(call: () => Promise<T>, map?: (e: unknown) => Error | undefined): Promise<T> {
    try {
      return await call();
    } catch (e) {
      const mapped = map?.(e);
      if (mapped) throw mapped;
      if (e instanceof BadRequestException || e instanceof BadGatewayException) throw e;
      this.logger.error(`Stellar RPC error: ${(e as Error).message}`);
      throw new BadGatewayException('The Stellar network could not be reached. Try again shortly.');
    }
  }
}

/**
 * Picks the `Attested` event for `version` and `hashHex` out of the contract's
 * events and returns its transaction hash. Countersigned events share the same
 * topics but carry no hash, so matching on the hash selects only attestations.
 */
export function attestTxHashFromEvents(
  events: { txHash: string; value: xdr.ScVal; inSuccessfulContractCall?: boolean }[],
  version: number,
  hashHex: string,
): string | null {
  for (const ev of events) {
    if (ev.inSuccessfulContractCall === false) continue;
    let data: unknown;
    try {
      data = scValToNative(ev.value);
    } catch {
      continue;
    }
    if (!data || typeof data !== 'object') continue;
    const d = data as Record<string, unknown>;
    if (!(d.hash instanceof Uint8Array)) continue;
    if (Number(d.version) === version && Buffer.from(d.hash).toString('hex') === hashHex.toLowerCase()) return ev.txHash;
  }
  return null;
}

/** The top-level result code of a rejected transaction (e.g. txBadSeq), if any. */
function resultCode(result: xdr.TransactionResult | undefined): string | null {
  try {
    return result ? result.result.type : null;
  } catch {
    return null;
  }
}

/** Thresholds are stored as four bytes: [master weight, low, medium, high]. */
export function accountSignersFromEntry(entry: xdr.AccountEntry): AccountSigners {
  const t = entry.thresholds.value;
  const signers: AccountSigners['signers'] = [];
  for (const s of entry.signers) {
    if (s.key.type === 'signerKeyTypeEd25519' && 'ed25519' in s.key) {
      signers.push({ key: StrKey.encodeEd25519PublicKey(Buffer.from(s.key.ed25519.value)), weight: s.weight });
    }
  }
  return {
    account_id: StrKey.encodeEd25519PublicKey(Buffer.from(entry.accountId.ed25519.value)),
    sequence: entry.seqNum.toString(),
    master_weight: t[0],
    thresholds: { low: t[1], med: t[2], high: t[3] },
    signers,
  };
}

/**
 * Whether an account needs both `a` and `b` to sign anything: its master key
 * and every signer weigh less than the lowest threshold, and `a` and `b`
 * together reach the highest one.
 */
export function requiresBoth(acct: AccountSigners, a: string, b: string): boolean {
  const { low, med, high } = acct.thresholds;
  const lowest = Math.min(low, med, high);
  const weight = (k: string) => acct.signers.find((s) => s.key === k)?.weight ?? 0;
  return (
    lowest > 0 &&
    acct.master_weight < lowest &&
    acct.signers.every((s) => s.weight < lowest) &&
    a !== b &&
    weight(a) + weight(b) >= Math.max(low, med, high)
  );
}

function contractErrorCode(message: string): number | null {
  const m = /Error\(Contract, #(\d+)\)/.exec(message);
  return m ? Number(m[1]) : null;
}

function normalizeAttestation(raw: unknown): OnChainAttestation | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const seconds = (v: unknown) => (v === null || v === undefined ? null : new Date(Number(v) * 1000).toISOString());
  return {
    org: String(r.org),
    package_id: String(r.package_id),
    version: Number(r.version),
    hash: Buffer.from(r.hash as Uint8Array).toString('hex'),
    period_start: String(r.period_start),
    period_end: String(r.period_end),
    attester: String(r.attester),
    attested_at: seconds(r.attested_at)!,
    attested_ledger: Number(r.attested_ledger),
    verifier: r.verifier ? String(r.verifier) : null,
    verified_at: seconds(r.verified_at),
  };
}
