-- Opaque organization identifier for the attestation contract (no contract change).
-- Each existing organization gets a random 128-bit id; nothing about it derives from
-- the organization's readable id.
ALTER TABLE "organizations" ADD COLUMN "chain_org_id" TEXT;

UPDATE "organizations"
SET "chain_org_id" = 'org_' || md5(random()::text || clock_timestamp()::text || "id");

ALTER TABLE "organizations" ALTER COLUMN "chain_org_id" SET NOT NULL;

CREATE UNIQUE INDEX "organizations_chain_org_id_key" ON "organizations"("chain_org_id");
