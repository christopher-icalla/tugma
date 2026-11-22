/**
 * Two-party (multisig) attestation: TUGMA and an independent reviewer must
 * both sign before a package hash is attested.
 *
 * The attester is a dedicated attestation account (MULTISIG_ATTESTATION_ACCOUNT)
 * whose signers are TUGMA's server key and the reviewer's key, weight 1 each,
 * with every threshold at 2 (scripts/create-attestation-account.js). It is
 * authorized as a signer on the contract and is also the transaction source,
 * so the contract's `attester.require_auth()` is satisfied by the transaction's
 * own signatures and the network accepts it only when both keys have signed.
 *
 *   1. request: TUGMA builds and simulates `attest`, signs it with its server
 *      key and stores the half-signed envelope as a pending co-sign request.
 *   2. The reviewer opens the request (public, by its unguessable id), checks
 *      what is being signed and signs the envelope in their own wallet.
 *   3. submit: the API checks that the envelope is unchanged and that the only
 *      new signature is the configured reviewer key's, then submits it.
 *
 * Everything here is off unless the MULTISIG_* settings are configured, and
 * runs on Stellar Testnet only.
 */
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { StellarCosignRequest } from '@prisma/client';
import { FeeBumpTransaction, Keypair, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import type { PublicUser } from '../auth/auth.guard';
import { AuditService } from '../common/audit.service';
import { config, TESTNET_PASSPHRASE } from '../config';
import { PrismaService } from '../prisma.service';
import { AttestationService } from './attestation.service';
import { addr, bytes32, requiresBoth, SorobanService, StaleTransactionError, str } from './soroban.service';
import { TugmaSigner } from './tugma-signer';

export const COSIGNED_BY = 'TUGMA + independent reviewer';

const short = (k: string) => `${k.slice(0, 6)}…${k.slice(-6)}`;

@Injectable()
export class CosignService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly soroban: SorobanService,
    private readonly audit: AuditService,
    private readonly attestations: AttestationService,
    private readonly signer: TugmaSigner,
  ) {}

  private settings() {
    const s = this.signer.settings;
    if (!this.signer.enabled || !s || !this.signer.publicKey) {
      throw new NotFoundException('Two-party attestation is not configured on this server.');
    }
    if (this.soroban.networkPassphrase !== TESTNET_PASSPHRASE) {
      throw new BadRequestException('Two-party attestation runs on Stellar Testnet only.');
    }
    return { ...s, tugma: this.signer.publicKey };
  }

  // ------------------------------------------------------------ request

  /** Builds the attestation, signs it as TUGMA and stores it for the reviewer. */
  async request(user: PublicUser, packageId: string) {
    this.settings();
    const pkg = await this.attestations.finalizedPackage(user, packageId);
    const open = await this.prisma.stellarCosignRequest.findFirst({
      where: { evidence_package_id: pkg.id, canonical_hash: pkg.canonical_hash, status: { in: ['AWAITING_REVIEWER', 'SUBMITTING'] } },
      orderBy: { created_at: 'desc' },
    });
    if (open && open.expires_at > new Date()) {
      return { message: 'This package is already waiting for the reviewer. Share the same signing link.', request: this.view(open) };
    }
    if (open) await this.markStale(open, 'The reviewer did not sign before the transaction expired.');
    const row = await this.build(user, pkg);
    return { message: 'Signed by TUGMA. Waiting for the reviewer to sign in their wallet.', request: this.view(row) };
  }

  /** Replaces an expired or stale request with a freshly built one (the reviewer signs again). */
  async rebuild(user: PublicUser, requestId: string) {
    this.settings();
    const old = await this.prisma.stellarCosignRequest.findFirst({ where: { id: requestId, organization_id: user.organization_id } });
    if (!old) throw new NotFoundException('Co-sign request not found.');
    if (old.status === 'CO_SIGNED') throw new ConflictException('This request is already co-signed on-chain.');
    if (old.status === 'SUBMITTING') throw new ConflictException('This request is being submitted right now.');
    const pkg = await this.attestations.finalizedPackage(user, old.evidence_package_id);
    const row = await this.build(user, pkg);
    await this.prisma.stellarCosignRequest.update({
      where: { id: old.id },
      data: { status: 'SUPERSEDED', status_detail: `Rebuilt as request ${row.id}.` },
    });
    return { message: 'Rebuilt and signed by TUGMA. Send the reviewer the new signing link.', request: this.view(row) };
  }

  private async build(user: PublicUser, pkg: { id: string; canonical_hash: string; period_start: string; period_end: string }) {
    const s = this.settings();
    if (await this.prisma.stellarAttestation.findUnique({ where: { attestation_hash: pkg.canonical_hash } })) {
      throw new ConflictException('This package hash is already attested on-chain.');
    }
    const account = await this.soroban.accountSigners(s.account);
    if (!account) {
      throw new BadRequestException(`The attestation account ${s.account} does not exist on Testnet. Create it with backend/scripts/create-attestation-account.js.`);
    }
    if (!requiresBoth(account, s.tugma, s.reviewer)) {
      throw new BadRequestException(
        `The attestation account ${s.account} does not require both TUGMA's key (${short(s.tugma)}) and the reviewer's key ` +
          `(${short(s.reviewer)}): check its signers, master weight and thresholds.`,
      );
    }
    const org = await this.attestations.chainOrgId(user);
    const expectedVersion = (await this.soroban.versionCount(org, pkg.id)) + 1;
    const tx = await this.soroban.prepareTimed(
      s.account, Math.round(s.ttlHours * 3600), 'attest',
      addr(s.account), str(org), str(pkg.id), str(pkg.period_start), str(pkg.period_end), bytes32(pkg.canonical_hash),
    );
    this.signer.sign(tx, this.soroban.networkPassphrase);
    const maxTime = Number(tx.timeBounds?.maxTime ?? 0);
    const row = await this.prisma.stellarCosignRequest.create({
      data: {
        organization_id: user.organization_id, evidence_package_id: pkg.id, canonical_hash: pkg.canonical_hash,
        period_start: pkg.period_start, period_end: pkg.period_end, expected_version: expectedVersion,
        attestation_account: s.account, tugma_signer: s.tugma, reviewer_signer: s.reviewer,
        network_passphrase: this.soroban.networkPassphrase, tx_hash: Buffer.from(tx.hash()).toString('hex'),
        xdr: tx.toXDR(), sequence: tx.sequence, expires_at: new Date(maxTime * 1000), status: 'AWAITING_REVIEWER',
        requested_by_id: user.id, requested_by_name: user.name,
      },
    });
    await this.audit.record(user, 'package:cosign-request', 'evidence_package', pkg.id, null, {
      request_id: row.id, hash: pkg.canonical_hash, attestation_account: s.account, tx_hash: row.tx_hash, expires_at: row.expires_at,
    });
    return row;
  }

  // ------------------------------------------------------------- review

  /** What the reviewer is asked to sign. Public: the id is unguessable and nothing in it is secret. */
  async get(requestId: string) {
    this.settings();
    const row = await this.prisma.stellarCosignRequest.findUnique({ where: { id: requestId } });
    if (!row) throw new NotFoundException('Co-sign request not found.');
    const pkg = await this.prisma.evidencePackage.findUnique({ where: { id: row.evidence_package_id }, select: { name: true } });
    return { request: this.view(row, { packageName: pkg?.name ?? null, publicView: true }) };
  }

  /** The reviewer's signed envelope: verify it, add the reviewer's signature to TUGMA's, submit. */
  async submitReviewer(requestId: string, signedXdr: string) {
    this.settings();
    const row = await this.prisma.stellarCosignRequest.findUnique({ where: { id: requestId } });
    if (!row) throw new NotFoundException('Co-sign request not found.');
    if (row.network_passphrase !== TESTNET_PASSPHRASE) throw new BadRequestException('Two-party attestation runs on Stellar Testnet only.');
    this.assertOpen(row);
    if (row.expires_at <= new Date()) {
      await this.markStale(row, 'The transaction expired before the reviewer signed it.');
      throw new ConflictException('This transaction expired before it was signed. Ask TUGMA to rebuild it, then sign the new one.');
    }

    const reviewerSig = this.reviewerSignature(row, signedXdr);
    const tx = TransactionBuilder.fromXDR(row.xdr, row.network_passphrase) as Transaction;
    tx.signatures.push(reviewerSig);

    // A transaction from the attestation account was accepted since this was built.
    const current = BigInt(await this.soroban.accountSequence(row.attestation_account));
    if (current >= BigInt(tx.sequence)) {
      const detail = 'The attestation account has signed another transaction since this one was built, so its sequence number is used.';
      await this.markStale(row, detail);
      throw new ConflictException(`${detail} Ask TUGMA to rebuild it, then sign the new one.`);
    }

    const claimed = await this.prisma.stellarCosignRequest.updateMany({
      where: { id: row.id, status: 'AWAITING_REVIEWER' },
      data: { status: 'SUBMITTING', reviewer_signed_at: new Date() },
    });
    if (claimed.count !== 1) throw new ConflictException('This request is already being submitted.');

    let result;
    try {
      result = await this.soroban.submit(tx, { staleAware: true });
    } catch (e) {
      if (e instanceof StaleTransactionError) {
        await this.markStale(row, e.message);
      } else {
        await this.prisma.stellarCosignRequest.update({ where: { id: row.id }, data: { status: 'AWAITING_REVIEWER', reviewer_signed_at: null } });
      }
      throw e;
    }

    const version = Number(result.returnValue);
    const attestation = await this.prisma.stellarAttestation.create({
      data: {
        organization_id: row.organization_id, evidence_package_id: row.evidence_package_id, network: config().STELLAR_NETWORK,
        contract_id: this.soroban.contractId, version, attestation_hash: row.canonical_hash,
        attester_address: row.attestation_account, attester_user_id: row.requested_by_id, attester_name: COSIGNED_BY,
        transaction_hash: result.hash, ledger: result.ledger, submitted_at: new Date(), verification_status: 'CO_SIGNED',
        multisig_signers: [{ role: 'tugma', key: row.tugma_signer }, { role: 'reviewer', key: row.reviewer_signer }],
      },
    });
    const done = await this.prisma.stellarCosignRequest.update({
      where: { id: row.id },
      data: { status: 'CO_SIGNED', status_detail: null, submitted_tx_hash: result.hash, ledger: result.ledger, version },
    });
    const reviewer: PublicUser = {
      id: `stellar:${row.reviewer_signer}`, email: '', name: 'Independent reviewer', role: 'REVIEWER', title: null,
      organization_id: row.organization_id, token_version: 0, created_at: new Date(),
    } as PublicUser;
    await this.audit.record(reviewer, 'package:cosign', 'evidence_package', row.evidence_package_id, null, {
      request_id: row.id, version, hash: row.canonical_hash, transaction_hash: result.hash, ledger: result.ledger,
      signers: { tugma: row.tugma_signer, reviewer: row.reviewer_signer },
    });
    return { message: `Co-signed and attested on-chain as version ${version}.`, attestation, request: this.view(done, { publicView: true }) };
  }

  /**
   * The reviewer's signature from a submitted envelope. The envelope must be
   * the stored transaction exactly (same hash, so same operations, fee,
   * sequence and time bounds), and every signature on it must be TUGMA's or
   * the configured reviewer key's, with the reviewer's present.
   */
  private reviewerSignature(row: StellarCosignRequest, signedXdr: string) {
    let tx: Transaction | FeeBumpTransaction;
    try {
      tx = TransactionBuilder.fromXDR(signedXdr, row.network_passphrase);
    } catch {
      throw new BadRequestException('signed_xdr is not a valid Testnet transaction envelope.');
    }
    if (tx instanceof FeeBumpTransaction) throw new BadRequestException('Fee-bump envelopes are not accepted.');
    if (Buffer.from(tx.hash()).toString('hex') !== row.tx_hash) {
      throw new BadRequestException('The signed transaction differs from the one TUGMA prepared. Sign the transaction exactly as shown, without changes.');
    }
    const hash = tx.hash();
    const tugma = Keypair.fromPublicKey(row.tugma_signer);
    const reviewer = Keypair.fromPublicKey(row.reviewer_signer);
    let found = null;
    for (const sig of tx.signatures) {
      if (tugma.verify(hash, sig.signature)) continue;
      if (reviewer.verify(hash, sig.signature)) {
        found = sig;
        continue;
      }
      throw new BadRequestException(`The transaction carries a signature that is not from the reviewer key ${row.reviewer_signer}. Sign with that key.`);
    }
    if (!found) throw new BadRequestException(`The transaction is not signed by the reviewer key ${row.reviewer_signer}.`);
    return found;
  }

  private assertOpen(row: StellarCosignRequest) {
    if (row.status === 'CO_SIGNED') throw new ConflictException('This attestation is already co-signed on-chain.');
    if (row.status === 'SUBMITTING') throw new ConflictException('This request is being submitted right now.');
    if (row.status === 'SUPERSEDED') throw new ConflictException('This request was replaced by a newer one. Use the latest signing link.');
    if (row.status === 'STALE') throw new ConflictException(`${row.status_detail ?? 'This transaction can no longer be submitted.'} Ask TUGMA to rebuild it.`);
  }

  private async markStale(row: StellarCosignRequest, detail: string) {
    await this.prisma.stellarCosignRequest.updateMany({
      where: { id: row.id, status: { in: ['AWAITING_REVIEWER', 'SUBMITTING'] } },
      data: { status: 'STALE', status_detail: detail },
    });
  }

  view(row: StellarCosignRequest, opts: { packageName?: string | null; publicView?: boolean } = {}) {
    const cfg = config();
    const waiting = row.status === 'AWAITING_REVIEWER';
    const expired = waiting && row.expires_at <= new Date();
    return {
      id: row.id,
      status: expired ? 'STALE' : row.status,
      status_detail: expired ? 'The transaction expired before the reviewer signed it.' : row.status_detail,
      package: {
        id: row.evidence_package_id, name: opts.packageName ?? undefined, period_start: row.period_start, period_end: row.period_end,
        canonical_hash: row.canonical_hash, expected_version: row.expected_version,
      },
      attestation_account: row.attestation_account,
      tugma_signer: row.tugma_signer,
      reviewer_signer: row.reviewer_signer,
      network: cfg.STELLAR_NETWORK,
      network_passphrase: row.network_passphrase,
      contract_id: this.soroban.contractId,
      tx_hash: row.tx_hash,
      xdr: waiting && !expired ? row.xdr : null,
      expires_at: row.expires_at,
      created_at: row.created_at,
      requested_by_name: opts.publicView ? undefined : row.requested_by_name,
      reviewer_signed_at: row.reviewer_signed_at,
      submitted_tx_hash: row.submitted_tx_hash,
      ledger: row.ledger,
      version: row.version,
      review_path: `/review/${row.id}`,
      explorer_url: cfg.STELLAR_EXPLORER_URL,
    };
  }
}
