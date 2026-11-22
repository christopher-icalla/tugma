/**
 * TUGMA's server signing key for two-party attestation, and the only place in
 * the API that loads a Stellar secret key.
 *
 * It exists only when two-party attestation is configured (MULTISIG_* in
 * config.ts). The key is one of two equal-weight signers on the attestation
 * account, whose thresholds need both: on its own it cannot get anything
 * accepted by the network. It signs nothing but attestation transactions this
 * API built for that account on Testnet. The secret stays in this module: it
 * is not logged, returned or stored, and only the public key leaves it.
 */
import { Injectable } from '@nestjs/common';
import { Keypair, Transaction } from '@stellar/stellar-sdk';
import { multisigSettings, MultisigSettings, TESTNET_PASSPHRASE } from '../config';

@Injectable()
export class TugmaSigner {
  /** Public settings only: the secret is not kept here. */
  readonly settings: Omit<MultisigSettings, 'tugmaSecret'> | null;
  readonly publicKey: string | null;
  readonly #keypair: Keypair | null;

  constructor() {
    // Throws at startup on a partial or inconsistent configuration.
    const s = multisigSettings();
    this.#keypair = s ? Keypair.fromSecret(s.tugmaSecret) : null;
    this.settings = s ? { account: s.account, reviewer: s.reviewer, ttlHours: s.ttlHours } : null;
    this.publicKey = this.#keypair?.publicKey() ?? null;
    if (this.settings && (this.publicKey === this.settings.reviewer || this.publicKey === this.settings.account)) {
      throw new Error('MULTISIG_TUGMA_SIGNER_SECRET must be a key of its own, not the reviewer key or the attestation account.');
    }
  }

  get enabled() {
    return this.#keypair !== null;
  }

  /** Adds TUGMA's signature to a Testnet transaction from the attestation account. */
  sign(tx: Transaction, networkPassphrase: string) {
    if (!this.#keypair || !this.settings) throw new Error('Two-party attestation is not configured.');
    if (networkPassphrase !== TESTNET_PASSPHRASE) throw new Error('Two-party attestation runs on Stellar Testnet only.');
    if (tx.source !== this.settings.account) throw new Error('TUGMA signs only transactions from the attestation account.');
    tx.sign(this.#keypair);
  }

  toJSON() {
    return { publicKey: this.publicKey };
  }
}
