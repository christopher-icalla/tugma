import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { EvidencePackage, StellarAttestation } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import type { PublicUser } from '../auth/auth.guard';
import { AuditService } from '../common/audit.service';
import { config } from '../config';
import { PrismaService } from '../prisma.service';
import { addr, bytes32, isAccountId, OnChainAttestation, SorobanService, str, u32 } from './soroban.service';

const PENDING_TTL_MS = 5 * 60_000;
const CHALLENGE_TTL_S = 5 * 60;

type Action = 'attest' | 'countersign';

@Injectable()
export class AttestationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly soroban: SorobanService,
    private readonly audit: AuditService,
  ) {}

  publicConfig() {
    const cfg = config();
    return {
      network: cfg.STELLAR_NETWORK,
      network_passphrase: cfg.STELLAR_NETWORK_PASSPHRASE,
      rpc_url: cfg.STELLAR_RPC_URL,
      contract_id: cfg.STELLAR_CONTRACT_ID,
      explorer_url: cfg.STELLAR_EXPLORER_URL,
    };
  }

  // ------------------------------------------------------ package status

  /** Adds `stellar` (latest on-chain version, or NOT_SUBMITTED) and `attestations` to packages. */
  async decorate(packages: EvidencePackage[]) {
    const rows = await this.prisma.stellarAttestation.findMany({
      where: { evidence_package_id: { in: packages.map((p) => p.id) } },
      orderBy: { version: 'desc' },
    });
    const cfg = config();
    return packages.map((p) => {
      const attestations = rows.filter((a) => a.evidence_package_id === p.id);
      const latest = attestations[0];
      const stellar = latest
        ? { ...latest, hash_matches_package: latest.attestation_hash === p.canonical_hash }
        : {
            evidence_package_id: p.id, network: cfg.STELLAR_NETWORK, contract_id: cfg.STELLAR_CONTRACT_ID,
            attestation_hash: p.canonical_hash, transaction_hash: null, ledger: null, stellar_account: null,
            submitted_at: null, verified_at: null, verification_status: 'NOT_SUBMITTED', hash_matches_package: false,
          };
      return { ...p, stellar, attestations };
    });
  }

  // ------------------------------------------------------ wallet linking

  challenge(user: PublicUser, address: string) {
    if (!isAccountId(address)) throw new BadRequestException('address must be a Stellar account id (G...).');
    const nonce = randomBytes(16).toString('hex');
    const expires = new Date(Date.now() + CHALLENGE_TTL_S * 1000).toISOString();
    const message = [
      'TUGMA wallet link',
      `User: ${user.email}`,
      `Organization: ${user.organization_id}`,
      `Stellar account: ${address}`,
      `Nonce: ${nonce}`,
      `Expires: ${expires}`,
    ].join('\n');
    const challenge = jwt.sign({ sub: user.id, address, message, type: 'wallet-link' }, config().JWT_SECRET, {
      algorithm: 'HS256', expiresIn: CHALLENGE_TTL_S,
    });
    return { message, challenge };
  }

  async link(user: PublicUser, challenge: string, signature: string) {
    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(challenge, config().JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    } catch {
      throw new BadRequestException('The link challenge expired. Start again.');
    }
    if (payload.type !== 'wallet-link' || payload.sub !== user.id) throw new BadRequestException('Invalid link challenge.');
    const address = String(payload.address);
    if (!this.soroban.verifySignedMessage(address, String(payload.message), signature)) {
      throw new BadRequestException('Signature does not match the wallet address.');
    }
    const owner = await this.prisma.user.findUnique({ where: { stellar_address: address } });
    if (owner && owner.id !== user.id) throw new ConflictException('This Stellar account is already linked to another user.');

    const before = { stellar_address: user.stellar_address };
    await this.prisma.user.update({ where: { id: user.id }, data: { stellar_address: address, stellar_linked_at: new Date() } });
    await this.audit.record(user, 'wallet:link', 'user', user.id, before, { stellar_address: address });
    return this.walletStatus({ ...user, stellar_address: address });
  }

  async unlink(user: PublicUser) {
    await this.prisma.user.update({ where: { id: user.id }, data: { stellar_address: null, stellar_linked_at: null } });
    await this.audit.record(user, 'wallet:unlink', 'user', user.id, { stellar_address: user.stellar_address }, null);
    return { address: null, is_signer: false };
  }

  async walletStatus(user: PublicUser) {
    if (!user.stellar_address) return { address: null, is_signer: false, organization_id: user.organization_id };
    return {
      address: user.stellar_address,
      is_signer: await this.soroban.isSigner(user.organization_id, user.stellar_address),
      organization_id: user.organization_id,
    };
  }

  // -------------------------------------------------- prepare / submit

  async prepareAttest(user: PublicUser, packageId: string) {
    const pkg = await this.finalizedPackage(user, packageId);
    const wallet = this.requireWallet(user);
    const existing = await this.prisma.stellarAttestation.findUnique({ where: { attestation_hash: pkg.canonical_hash } });
    if (existing) throw new ConflictException(`This package hash is already attested on-chain (version ${existing.version}).`);

    const params = { org: user.organization_id, package_id: pkg.id, period_start: pkg.period_start, period_end: pkg.period_end, hash: pkg.canonical_hash };
    const tx = await this.soroban.prepare(
      wallet, 'attest',
      addr(wallet), str(params.org), str(params.package_id), str(params.period_start), str(params.period_end), bytes32(params.hash),
    );
    return this.savePending(user, pkg.id, 'attest', Buffer.from(tx.hash()).toString('hex'), params, tx.toXDR());
  }

  async prepareCountersign(user: PublicUser, packageId: string) {
    const pkg = await this.finalizedPackage(user, packageId);
    const wallet = this.requireWallet(user);
    const latest = await this.prisma.stellarAttestation.findFirst({
      where: { evidence_package_id: pkg.id }, orderBy: { version: 'desc' },
    });
    if (!latest) throw new BadRequestException('Attest the package on-chain before countersigning.');
    if (latest.verification_status === 'VERIFIED') throw new ConflictException(`Version ${latest.version} is already countersigned.`);
    if (latest.attester_user_id === user.id || latest.attester_address === wallet) {
      throw new ForbiddenException('Independent verification required: the countersigner must differ from the attester (segregation of duties).');
    }

    const params = { org: user.organization_id, package_id: pkg.id, version: latest.version };
    const tx = await this.soroban.prepare(wallet, 'countersign', addr(wallet), str(params.org), str(params.package_id), u32(params.version));
    return this.savePending(user, pkg.id, 'countersign', Buffer.from(tx.hash()).toString('hex'), params, tx.toXDR());
  }

  async submit(user: PublicUser, pendingId: string, signedXdr: string) {
    const pending = await this.prisma.stellarPendingTx.findUnique({ where: { id: pendingId } });
    if (!pending || pending.user_id !== user.id) throw new NotFoundException('Pending transaction not found.');
    if (pending.submitted_at) throw new ConflictException('This transaction was already submitted.');
    if (pending.expires_at < new Date()) throw new BadRequestException('The prepared transaction expired. Prepare it again.');

    const tx = this.soroban.parseSigned(signedXdr);
    if (Buffer.from(tx.hash()).toString('hex') !== pending.tx_hash) {
      throw new BadRequestException('The signed transaction does not match the one prepared for you.');
    }
    // Claim before sending so a double-click can't submit twice.
    const claimed = await this.prisma.stellarPendingTx.updateMany({ where: { id: pending.id, submitted_at: null }, data: { submitted_at: new Date() } });
    if (claimed.count !== 1) throw new ConflictException('This transaction was already submitted.');

    let result;
    try {
      result = await this.soroban.submit(tx);
    } catch (e) {
      await this.prisma.stellarPendingTx.update({ where: { id: pending.id }, data: { submitted_at: null } });
      throw e;
    }

    const params = pending.params as Record<string, string | number>;
    const pkg = await this.prisma.evidencePackage.findUniqueOrThrow({ where: { id: pending.evidence_package_id } });
    if (pending.action === 'attest') {
      const version = Number(result.returnValue);
      const row = await this.prisma.stellarAttestation.create({
        data: {
          organization_id: user.organization_id, evidence_package_id: pkg.id, network: config().STELLAR_NETWORK,
          contract_id: this.soroban.contractId, version, attestation_hash: String(params.hash),
          attester_address: user.stellar_address!, attester_user_id: user.id, attester_name: user.name,
          transaction_hash: result.hash, ledger: result.ledger, submitted_at: new Date(), verification_status: 'ATTESTED',
        },
      });
      await this.audit.record(user, 'package:attest', 'evidence_package', pkg.id, null, {
        version, hash: row.attestation_hash, transaction_hash: result.hash, ledger: result.ledger,
      });
      return { message: `Attested on-chain as version ${version}.`, attestation: row };
    }

    const row = await this.prisma.stellarAttestation.update({
      where: { evidence_package_id_version: { evidence_package_id: pkg.id, version: Number(params.version) } },
      data: {
        verifier_address: user.stellar_address, verifier_user_id: user.id, verifier_name: user.name,
        countersign_tx_hash: result.hash, countersign_ledger: result.ledger, verified_at: new Date(), verification_status: 'VERIFIED',
      },
    });
    await this.audit.record(user, 'package:countersign', 'evidence_package', pkg.id, null, {
      version: row.version, transaction_hash: result.hash, ledger: result.ledger,
    });
    return { message: `Version ${row.version} countersigned on-chain.`, attestation: row };
  }

  /**
   * Rebuilds local attestation rows for a package from contract state — covers
   * CLI attestations and submissions whose confirmation we missed.
   */
  async sync(user: PublicUser, packageId: string) {
    const pkg = await this.package(user, packageId);
    const count = await this.soroban.versionCount(user.organization_id, pkg.id);
    const rows: StellarAttestation[] = [];
    for (let version = 1; version <= count; version++) {
      const chain = await this.soroban.get(user.organization_id, pkg.id, version);
      if (chain) rows.push(await this.upsertFromChain(pkg, chain));
    }
    await this.audit.record(user, 'package:sync', 'evidence_package', pkg.id, null, { versions: count });
    return { message: `Synced ${count} on-chain version(s).`, attestations: rows };
  }

  /** Public lookup of a package hash against the contract. */
  async verifyHash(hash: string) {
    const normalized = hash.trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(normalized)) throw new BadRequestException('Hash must be 64 hex characters (SHA-256).');
    const onchain = await this.soroban.verify(normalized);
    const local = await this.prisma.stellarAttestation.findUnique({ where: { attestation_hash: normalized } });
    const pkg = local ? await this.prisma.evidencePackage.findUnique({ where: { id: local.evidence_package_id } }) : null;
    return {
      hash: normalized,
      found: !!onchain,
      onchain,
      package: pkg ? { id: pkg.id, name: pkg.name, period_start: pkg.period_start, period_end: pkg.period_end } : null,
      transaction_hash: local?.transaction_hash ?? null,
      ...this.publicConfig(),
    };
  }

  // ---------------------------------------------------------- helpers

  private requireWallet(user: PublicUser): string {
    if (!user.stellar_address) throw new BadRequestException('Link a Stellar wallet (Settings → Stellar Wallet) first.');
    return user.stellar_address;
  }

  private async package(user: PublicUser, id: string) {
    const pkg = await this.prisma.evidencePackage.findFirst({ where: { id, organization_id: user.organization_id } });
    if (!pkg) throw new NotFoundException('Package not found.');
    return pkg;
  }

  private async finalizedPackage(user: PublicUser, id: string) {
    const pkg = await this.package(user, id);
    if (pkg.status !== 'FINALIZED') throw new BadRequestException('Only generated (FINALIZED) packages can be anchored on-chain.');
    return pkg;
  }

  private async savePending(user: PublicUser, packageId: string, action: Action, txHash: string, params: object, xdrB64: string) {
    const pending = await this.prisma.stellarPendingTx.create({
      data: {
        user_id: user.id, organization_id: user.organization_id, evidence_package_id: packageId, action,
        tx_hash: txHash, params, expires_at: new Date(Date.now() + PENDING_TTL_MS),
      },
    });
    return { pending_id: pending.id, action, xdr: xdrB64, ...this.publicConfig() };
  }

  private async upsertFromChain(pkg: EvidencePackage, chain: OnChainAttestation) {
    const users = await this.prisma.user.findMany({ where: { stellar_address: { in: [chain.attester, chain.verifier ?? ''] } } });
    const byAddress = new Map(users.map((u) => [u.stellar_address, u]));
    const attester = byAddress.get(chain.attester);
    const verifier = chain.verifier ? byAddress.get(chain.verifier) : undefined;
    const existing = await this.prisma.stellarAttestation.findUnique({
      where: { evidence_package_id_version: { evidence_package_id: pkg.id, version: chain.version } },
    });
    const onchain = {
      attestation_hash: chain.hash, attester_address: chain.attester, ledger: chain.attested_ledger,
      verifier_address: chain.verifier, verified_at: chain.verified_at ? new Date(chain.verified_at) : null,
      verification_status: chain.verifier ? 'VERIFIED' : 'ATTESTED',
      verifier_user_id: verifier?.id ?? existing?.verifier_user_id ?? null,
      verifier_name: chain.verifier ? verifier?.name ?? existing?.verifier_name ?? 'External signer' : null,
    };
    if (existing) {
      return this.prisma.stellarAttestation.update({ where: { id: existing.id }, data: onchain });
    }
    return this.prisma.stellarAttestation.create({
      data: {
        ...onchain, organization_id: pkg.organization_id, evidence_package_id: pkg.id, network: config().STELLAR_NETWORK,
        contract_id: this.soroban.contractId, version: chain.version, attester_user_id: attester?.id ?? null,
        attester_name: attester?.name ?? 'External signer',
        transaction_hash: null, // not stored in contract state; the ledger number locates it
        submitted_at: new Date(chain.attested_at),
      },
    });
  }
}
