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
import { TugmaSigner } from './tugma-signer';

const PENDING_TTL_MS = 5 * 60_000;
const CHALLENGE_TTL_S = 5 * 60;

type Action = 'attest' | 'countersign';

@Injectable()
export class AttestationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly soroban: SorobanService,
    private readonly audit: AuditService,
    private readonly signer: TugmaSigner,
  ) {}

  publicConfig() {
    const cfg = config();
    const ms = this.signer.settings;
    return {
      network: cfg.STELLAR_NETWORK,
      network_passphrase: cfg.STELLAR_NETWORK_PASSPHRASE,
      rpc_url: cfg.STELLAR_RPC_URL,
      contract_id: cfg.STELLAR_CONTRACT_ID,
      explorer_url: cfg.STELLAR_EXPLORER_URL,
      // Present only when two-party attestation is configured (public keys only).
      ...(this.signer.enabled && ms
        ? { multisig: { attestation_account: ms.account, tugma_signer: this.signer.publicKey, reviewer_signer: ms.reviewer, ttl_hours: ms.ttlHours } }
        : {}),
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
    const cosigns = await this.latestCosigns(packages.map((p) => p.id));
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
      return { ...p, stellar, attestations, ...(cosigns ? { cosign: cosigns.get(p.id) ?? null } : {}) };
    });
  }

  /** The latest two-party co-sign request per package; null when the feature is off. */
  private async latestCosigns(packageIds: string[]) {
    if (!this.signer.enabled) return null;
    const rows = await this.prisma.stellarCosignRequest.findMany({
      where: { evidence_package_id: { in: packageIds } },
      orderBy: { created_at: 'desc' },
    });
    const latest = new Map<string, (typeof rows)[number]>();
    for (const r of rows) if (!latest.has(r.evidence_package_id)) latest.set(r.evidence_package_id, r);
    const now = new Date();
    return new Map(
      [...latest].map(([id, r]) => {
        const expired = r.status === 'AWAITING_REVIEWER' && r.expires_at <= now;
        return [id, {
          id: r.id, status: expired ? 'STALE' : r.status, status_detail: expired ? 'The transaction expired before the reviewer signed it.' : r.status_detail,
          canonical_hash: r.canonical_hash, attestation_account: r.attestation_account, tugma_signer: r.tugma_signer,
          reviewer_signer: r.reviewer_signer, expires_at: r.expires_at, created_at: r.created_at, requested_by_name: r.requested_by_name,
          submitted_tx_hash: r.submitted_tx_hash, review_path: `/review/${r.id}`,
        }];
      }),
    );
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
    const onchainOrgId = await this.chainOrgId(user);
    if (!user.stellar_address) return { address: null, is_signer: false, organization_id: user.organization_id, onchain_org_id: onchainOrgId };
    return {
      address: user.stellar_address,
      is_signer: await this.soroban.isSigner(onchainOrgId, user.stellar_address),
      organization_id: user.organization_id,
      onchain_org_id: onchainOrgId,
    };
  }

  /**
   * Every wallet linked in the organization with its on-chain signer status, plus
   * the admin CLI command that authorizes it. The API can't sign add_signer
   * itself: the contract admin key stays with the admin.
   */
  async signerOverview(user: PublicUser) {
    const cfg = config();
    const onchainOrgId = await this.chainOrgId(user);
    const users = await this.prisma.user.findMany({
      where: { organization_id: user.organization_id, stellar_address: { not: null } },
      orderBy: { name: 'asc' },
    });
    const wallets = await Promise.all(
      users.map(async (u) => ({
        user_id: u.id, name: u.name, email: u.email, role: u.role,
        address: u.stellar_address!, linked_at: u.stellar_linked_at,
        is_signer: await this.soroban.isSigner(onchainOrgId, u.stellar_address!),
      })),
    );
    const pending = wallets.filter((w) => !w.is_signer).map((w) => w.address);
    const invoke = (address: string) =>
      `stellar contract invoke --id ${cfg.STELLAR_CONTRACT_ID} --source tugma-admin --network ${cfg.STELLAR_NETWORK.toLowerCase()} -- ` +
      `add_signer --org ${onchainOrgId} --signer ${address}`;
    return {
      organization_id: user.organization_id,
      onchain_org_id: onchainOrgId,
      contract_id: cfg.STELLAR_CONTRACT_ID,
      network: cfg.STELLAR_NETWORK,
      wallets: wallets.map((w) => ({ ...w, command: w.is_signer ? null : invoke(w.address) })),
      pending_count: pending.length,
      script_command: pending.length
        ? `CONTRACT_ID=${cfg.STELLAR_CONTRACT_ID} ORG=${onchainOrgId} NETWORK=${cfg.STELLAR_NETWORK.toLowerCase()} ` +
          `./contracts/scripts/authorize-signers.sh ${pending.join(' ')}`
        : null,
    };
  }

  // -------------------------------------------------- prepare / submit

  async prepareAttest(user: PublicUser, packageId: string) {
    const pkg = await this.finalizedPackage(user, packageId);
    const wallet = this.requireWallet(user);
    const existing = await this.prisma.stellarAttestation.findUnique({ where: { attestation_hash: pkg.canonical_hash } });
    if (existing) throw new ConflictException(`This package hash is already attested on-chain (version ${existing.version}).`);

    const params = { org: await this.chainOrgId(user), package_id: pkg.id, period_start: pkg.period_start, period_end: pkg.period_end, hash: pkg.canonical_hash };
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

    const params = { org: await this.chainOrgId(user), package_id: pkg.id, version: latest.version };
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
    const onchainOrgId = await this.chainOrgId(user);
    const count = await this.soroban.versionCount(onchainOrgId, pkg.id);
    const rows: StellarAttestation[] = [];
    for (let version = 1; version <= count; version++) {
      const chain = await this.soroban.get(onchainOrgId, pkg.id, version);
      if (chain) rows.push(await this.upsertFromChain(pkg, chain));
    }
    const missing = rows.filter((r) => !r.transaction_hash).map((r) => r.version);
    await this.audit.record(user, 'package:sync', 'evidence_package', pkg.id, null, { versions: count, missing_transaction_hash: missing });
    const message = missing.length
      ? `Synced ${count} on-chain version(s). The transaction hash of version(s) ${missing.join(', ')} could not be recovered: ` +
        'the Stellar RPC no longer holds events for that ledger. The ledger number still locates it.'
      : `Synced ${count} on-chain version(s).`;
    return { message, attestations: rows };
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

  /**
   * The opaque identifier the contract knows this organization by. Every contract
   * call uses it instead of the readable organization id (see docs/onchain-footprint.md).
   */
  async chainOrgId(user: PublicUser): Promise<string> {
    const org = await this.prisma.organization.findUnique({ where: { id: user.organization_id }, select: { chain_org_id: true } });
    if (!org) throw new NotFoundException('Organization not found.');
    return org.chain_org_id;
  }

  private requireWallet(user: PublicUser): string {
    if (!user.stellar_address) throw new BadRequestException('Link a Stellar wallet (Settings → Stellar Wallet) first.');
    return user.stellar_address;
  }

  private async package(user: PublicUser, id: string) {
    const pkg = await this.prisma.evidencePackage.findFirst({ where: { id, organization_id: user.organization_id } });
    if (!pkg) throw new NotFoundException('Package not found.');
    return pkg;
  }

  async finalizedPackage(user: PublicUser, id: string) {
    const pkg = await this.package(user, id);
    if (pkg.status !== 'FINALIZED') throw new BadRequestException('Only generated (FINALIZED) packages can be anchored on-chain.');
    return pkg;
  }

  /** Both signers of a co-signed version, from its co-sign request (or the current settings, for one made elsewhere). */
  private async multisigSigners(hash: string) {
    const req = await this.prisma.stellarCosignRequest.findFirst({ where: { canonical_hash: hash, status: 'CO_SIGNED' } });
    const tugma = req?.tugma_signer ?? this.signer.publicKey;
    const reviewer = req?.reviewer_signer ?? this.signer.settings?.reviewer;
    return tugma && reviewer ? [{ role: 'tugma', key: tugma }, { role: 'reviewer', key: reviewer }] : undefined;
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
    // Contract state has no transaction hash. Keep the one recorded at submit time;
    // otherwise recover it from the Attested event in the ledger the contract stored.
    const transactionHash =
      existing?.transaction_hash ??
      (await this.soroban.findAttestTxHash(chain.org, chain.package_id, chain.version, chain.hash, chain.attested_ledger));
    // A version attested by the two-party attestation account stays CO_SIGNED until someone countersigns it.
    const multisig = existing?.verification_status === 'CO_SIGNED' || (!!this.signer.settings && chain.attester === this.signer.settings.account);
    const onchain = {
      attestation_hash: chain.hash, attester_address: chain.attester, ledger: chain.attested_ledger,
      verifier_address: chain.verifier, verified_at: chain.verified_at ? new Date(chain.verified_at) : null,
      verification_status: chain.verifier ? 'VERIFIED' : multisig ? 'CO_SIGNED' : 'ATTESTED',
      verifier_user_id: verifier?.id ?? existing?.verifier_user_id ?? null,
      verifier_name: chain.verifier ? verifier?.name ?? existing?.verifier_name ?? 'External signer' : null,
    };
    if (existing) {
      return this.prisma.stellarAttestation.update({
        where: { id: existing.id },
        data: { ...onchain, ...(transactionHash ? { transaction_hash: transactionHash } : {}) },
      });
    }
    return this.prisma.stellarAttestation.create({
      data: {
        ...onchain, organization_id: pkg.organization_id, evidence_package_id: pkg.id, network: config().STELLAR_NETWORK,
        contract_id: this.soroban.contractId, version: chain.version, attester_user_id: attester?.id ?? null,
        attester_name: attester?.name ?? (multisig ? 'TUGMA + independent reviewer' : 'External signer'),
        ...(multisig ? { multisig_signers: await this.multisigSigners(chain.hash) } : {}),
        transaction_hash: transactionHash, // recovered from the Attested event; null only past RPC retention
        submitted_at: new Date(chain.attested_at),
      },
    });
  }
}
