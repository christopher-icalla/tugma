-- Two-party (multisig) attestation: reviewer co-sign requests, and the signers of a
-- co-signed attestation. Both stay empty unless the MULTISIG_* settings are configured.
-- AlterTable
ALTER TABLE "stellar_attestations" ADD COLUMN     "multisig_signers" JSONB;

-- CreateTable
CREATE TABLE "stellar_cosign_requests" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "evidence_package_id" TEXT NOT NULL,
    "canonical_hash" TEXT NOT NULL,
    "period_start" TEXT NOT NULL,
    "period_end" TEXT NOT NULL,
    "expected_version" INTEGER NOT NULL,
    "attestation_account" TEXT NOT NULL,
    "tugma_signer" TEXT NOT NULL,
    "reviewer_signer" TEXT NOT NULL,
    "network_passphrase" TEXT NOT NULL,
    "tx_hash" TEXT NOT NULL,
    "xdr" TEXT NOT NULL,
    "sequence" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "status_detail" TEXT,
    "requested_by_id" TEXT NOT NULL,
    "requested_by_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewer_signed_at" TIMESTAMP(3),
    "submitted_tx_hash" TEXT,
    "ledger" INTEGER,
    "version" INTEGER,

    CONSTRAINT "stellar_cosign_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stellar_cosign_requests_tx_hash_key" ON "stellar_cosign_requests"("tx_hash");

-- CreateIndex
CREATE INDEX "stellar_cosign_requests_evidence_package_id_created_at_idx" ON "stellar_cosign_requests"("evidence_package_id", "created_at");

