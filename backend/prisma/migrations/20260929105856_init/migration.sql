-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "title" TEXT,
    "organization_id" TEXT NOT NULL,
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stellar_address" TEXT,
    "stellar_linked_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "identifier" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "locked_until" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("identifier")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_requests" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regulatory_sources" (
    "id" TEXT NOT NULL,
    "regulator" TEXT NOT NULL,
    "regulator_full" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "publication_date" TEXT NOT NULL,
    "effective_date" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "last_reviewed_at" TIMESTAMP(3) NOT NULL,
    "content_hash" TEXT NOT NULL,
    "coverage" TEXT[],

    CONSTRAINT "regulatory_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regulatory_requirements" (
    "id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "requirement_code" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "requirement_summary" TEXT NOT NULL,
    "regulatory_intent" TEXT NOT NULL,
    "applicability" TEXT NOT NULL,
    "effective_date" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "regulatory_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "controls" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "control_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "requirement_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "risk_level" TEXT NOT NULL,
    "control_type" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "owner_role" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "automated" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL,
    "interpretation" TEXT NOT NULL,
    "test_logic" TEXT NOT NULL,
    "primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "controls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "control_tests" (
    "id" TEXT NOT NULL,
    "control_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "data_sources" TEXT[],
    "required_fields" TEXT[],
    "logic_type" TEXT NOT NULL,
    "logic_definition" TEXT NOT NULL,
    "threshold" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL,

    CONSTRAINT "control_tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "criticality" TEXT NOT NULL,
    "due_diligence_status" TEXT NOT NULL,
    "last_reviewed" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "transaction_amount" DECIMAL(14,2) NOT NULL,
    "processor_amount" DECIMAL(14,2) NOT NULL,
    "expected_settlement" DECIMAL(14,2) NOT NULL,
    "actual_settlement" DECIMAL(14,2),
    "expected_payout" DECIMAL(14,2) NOT NULL,
    "actual_payout" DECIMAL(14,2),
    "transaction_timestamp" TIMESTAMP(3) NOT NULL,
    "settlement_timestamp" TIMESTAMP(3),
    "payout_timestamp" TIMESTAMP(3),
    "payment_status" TEXT NOT NULL,
    "risk_status" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "approval_status" TEXT NOT NULL,
    "initiated_by" TEXT NOT NULL,
    "approved_by" TEXT NOT NULL,
    "has_evidence" BOOLEAN NOT NULL,
    "duplicate_of" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL,
    "has_exception" BOOLEAN NOT NULL DEFAULT false,
    "failed_controls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "defect_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "test_status" TEXT,
    "exception_severity" TEXT,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "control_test_runs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "control_id" TEXT,
    "control_code" TEXT NOT NULL,
    "control_test_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL,
    "records_tested" INTEGER NOT NULL,
    "passed_count" INTEGER NOT NULL,
    "failed_count" INTEGER NOT NULL,
    "warning_count" INTEGER NOT NULL,
    "not_testable_count" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "triggered_by" TEXT NOT NULL,
    "execution_metadata" JSONB NOT NULL,

    CONSTRAINT "control_test_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exceptions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "exception_code" TEXT NOT NULL,
    "control_id" TEXT,
    "control_code" TEXT NOT NULL,
    "control_test_run_id" TEXT,
    "transaction_id" TEXT,
    "defect_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "explanation" JSONB NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "detected_at" TIMESTAMP(3) NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "owner_role" TEXT,
    "owner_id" TEXT,
    "owner_name" TEXT,
    "assigned_at" TIMESTAMP(3),
    "evidence_id" TEXT,
    "root_cause" TEXT,
    "resolved_at" TIMESTAMP(3),
    "resolved_by" TEXT,
    "verified_at" TIMESTAMP(3),
    "verified_by" TEXT,
    "verified_by_name" TEXT,
    "verification_status" TEXT,
    "comments" JSONB NOT NULL DEFAULT '[]',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "remediation_actions" (
    "id" TEXT NOT NULL,
    "exception_code" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "owner_role" TEXT,
    "due_date" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "completion_note" TEXT,
    "completed_at" TIMESTAMP(3),
    "verified_by" TEXT,
    "verified_at" TIMESTAMP(3),

    CONSTRAINT "remediation_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "evidence_type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source_system" TEXT,
    "content" TEXT,
    "file_reference" TEXT,
    "requirement_id" TEXT,
    "control_id" TEXT,
    "control_test_id" TEXT,
    "exception_id" TEXT,
    "transaction_id" TEXT,
    "remediation_id" TEXT,
    "captured_at" TIMESTAMP(3) NOT NULL,
    "captured_by" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_until" TIMESTAMP(3),
    "verification_status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_packages" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "period_start" TEXT NOT NULL,
    "period_end" TEXT NOT NULL,
    "controls_count" INTEGER NOT NULL,
    "transactions_count" INTEGER NOT NULL,
    "exceptions_count" INTEGER NOT NULL,
    "evidence_count" INTEGER NOT NULL,
    "completeness_score" INTEGER NOT NULL,
    "canonical_hash" TEXT NOT NULL,
    "manifest" JSONB,
    "generated_at" TIMESTAMP(3) NOT NULL,
    "generated_by" TEXT,
    "status" TEXT NOT NULL,

    CONSTRAINT "evidence_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stellar_attestations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "evidence_package_id" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "attestation_hash" TEXT NOT NULL,
    "attester_address" TEXT NOT NULL,
    "attester_user_id" TEXT,
    "attester_name" TEXT NOT NULL,
    "transaction_hash" TEXT,
    "ledger" INTEGER NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL,
    "verifier_address" TEXT,
    "verifier_user_id" TEXT,
    "verifier_name" TEXT,
    "countersign_tx_hash" TEXT,
    "countersign_ledger" INTEGER,
    "verified_at" TIMESTAMP(3),
    "verification_status" TEXT NOT NULL,

    CONSTRAINT "stellar_attestations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stellar_pending_txs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "evidence_package_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "tx_hash" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "submitted_at" TIMESTAMP(3),

    CONSTRAINT "stellar_pending_txs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "user_name" TEXT,
    "user_role" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before_state" JSONB,
    "after_state" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_stellar_address_key" ON "users"("stellar_address");

-- CreateIndex
CREATE INDEX "users_organization_id_idx" ON "users"("organization_id");

-- CreateIndex
CREATE INDEX "login_attempts_email_idx" ON "login_attempts"("email");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE INDEX "password_reset_requests_email_created_at_idx" ON "password_reset_requests"("email", "created_at");

-- CreateIndex
CREATE INDEX "regulatory_requirements_source_id_idx" ON "regulatory_requirements"("source_id");

-- CreateIndex
CREATE UNIQUE INDEX "controls_organization_id_control_code_key" ON "controls"("organization_id", "control_code");

-- CreateIndex
CREATE UNIQUE INDEX "control_tests_control_id_key" ON "control_tests"("control_id");

-- CreateIndex
CREATE INDEX "vendors_organization_id_idx" ON "vendors"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_transaction_id_key" ON "payment_transactions"("transaction_id");

-- CreateIndex
CREATE INDEX "payment_transactions_organization_id_transaction_timestamp_idx" ON "payment_transactions"("organization_id", "transaction_timestamp");

-- CreateIndex
CREATE INDEX "payment_transactions_merchant_id_idx" ON "payment_transactions"("merchant_id");

-- CreateIndex
CREATE INDEX "payment_transactions_payment_status_idx" ON "payment_transactions"("payment_status");

-- CreateIndex
CREATE INDEX "payment_transactions_risk_status_idx" ON "payment_transactions"("risk_status");

-- CreateIndex
CREATE INDEX "payment_transactions_test_status_idx" ON "payment_transactions"("test_status");

-- CreateIndex
CREATE INDEX "payment_transactions_idempotency_key_idx" ON "payment_transactions"("idempotency_key");

-- CreateIndex
CREATE INDEX "control_test_runs_organization_id_control_code_completed_at_idx" ON "control_test_runs"("organization_id", "control_code", "completed_at");

-- CreateIndex
CREATE UNIQUE INDEX "exceptions_exception_code_key" ON "exceptions"("exception_code");

-- CreateIndex
CREATE INDEX "exceptions_organization_id_detected_at_idx" ON "exceptions"("organization_id", "detected_at");

-- CreateIndex
CREATE INDEX "exceptions_control_code_idx" ON "exceptions"("control_code");

-- CreateIndex
CREATE INDEX "exceptions_status_idx" ON "exceptions"("status");

-- CreateIndex
CREATE INDEX "exceptions_severity_idx" ON "exceptions"("severity");

-- CreateIndex
CREATE INDEX "exceptions_transaction_id_idx" ON "exceptions"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "remediation_actions_exception_code_key" ON "remediation_actions"("exception_code");

-- CreateIndex
CREATE INDEX "evidence_organization_id_exception_id_idx" ON "evidence"("organization_id", "exception_id");

-- CreateIndex
CREATE INDEX "evidence_control_id_idx" ON "evidence"("control_id");

-- CreateIndex
CREATE INDEX "evidence_packages_organization_id_generated_at_idx" ON "evidence_packages"("organization_id", "generated_at");

-- CreateIndex
CREATE UNIQUE INDEX "stellar_attestations_attestation_hash_key" ON "stellar_attestations"("attestation_hash");

-- CreateIndex
CREATE UNIQUE INDEX "stellar_attestations_evidence_package_id_version_key" ON "stellar_attestations"("evidence_package_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "stellar_pending_txs_tx_hash_key" ON "stellar_pending_txs"("tx_hash");

-- CreateIndex
CREATE INDEX "stellar_pending_txs_user_id_idx" ON "stellar_pending_txs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_timestamp_idx" ON "audit_logs"("organization_id", "timestamp");

-- CreateIndex
CREATE INDEX "audit_logs_entity_id_idx" ON "audit_logs"("entity_id");
