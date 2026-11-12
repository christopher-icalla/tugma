import { randomBytes } from 'node:crypto';

/**
 * A new opaque organization identifier for the attestation contract: `org_` and
 * 128 random bits. It is not derived from the organization's id or name, so the
 * public ledger can't be linked back to an organization without TUGMA's database.
 */
export const newChainOrgId = () => `org_${randomBytes(16).toString('hex')}`;
