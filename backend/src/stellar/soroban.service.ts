/**
 * Thin client for the TUGMA attestation registry contract (contracts/).
 *
 * The API never holds signing keys: it builds and simulates transactions for a
 * user's wallet (Freighter) to sign, submits the signed envelope, and reads
 * contract state through simulation.
 */
import { BadRequestException, BadGatewayException, Injectable, Logger } from '@nestjs/common';
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

  // --------------------------------------------------------------- writes

  /**
   * Builds and simulates a contract call with `source` as the transaction
   * source (and therefore the authorizing account). Returns the assembled,
   * unsigned transaction for the user's wallet to sign.
   */
  async prepare(source: string, method: string, ...args: xdr.ScVal[]): Promise<Transaction> {
    const account = await this.rpc(() => this.server.getAccount(source), (e) =>
      /not found/i.test(String(e))
        ? new BadRequestException(`Stellar account ${source} does not exist on this network yet. Fund it first (testnet: Friendbot).`)
        : undefined,
    );
    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: this.networkPassphrase })
      .addOperation(this.contract.call(method, ...args))
      .setTimeout(300)
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

  async submit(tx: Transaction): Promise<SubmitResult> {
    const sent = await this.rpc(() => this.server.sendTransaction(tx));
    if (sent.status === 'ERROR' || sent.status === 'TRY_AGAIN_LATER') {
      this.logger.warn(`sendTransaction ${sent.status}: ${sent.errorResult?.toXDR('base64') ?? ''}`);
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
