import { Throttle } from '@nestjs/throttler';

const perMinute = (limit: number) => Throttle({ default: { limit, ttl: 60_000 } });

/** Credential endpoints: slows password spraying across many emails from one IP. */
export const AuthRateLimit = () => perMinute(10);
/** Wallet linking and transaction building (each call hits Stellar RPC). */
export const StellarWriteRateLimit = () => perMinute(20);
/** Public, unauthenticated contract lookups. */
export const PublicLookupRateLimit = () => perMinute(30);
