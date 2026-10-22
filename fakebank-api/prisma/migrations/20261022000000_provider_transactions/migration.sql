-- Provider Transactions and their immutable event history (T3).

CREATE TABLE "provider_transaction" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "external_reference" VARCHAR(128) NOT NULL,
    "idempotency_key" VARCHAR(255) NOT NULL,
    -- SHA-256 of the normalized request (External Reference, Amount, currency); compared on idempotent retries.
    "request_fingerprint" TEXT NOT NULL,
    -- Integer minor units (centavos), never a decimal.
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" TEXT NOT NULL,
    "failure_code" TEXT,
    -- The Simulation Scenario Outcome applied on creation, if any (diagnostic only).
    "applied_outcome" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "provider_transaction_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "provider_transaction_amount_minor_positive" CHECK ("amount_minor" > 0),
    CONSTRAINT "provider_transaction_status_valid" CHECK ("status" IN ('PROCESSING', 'SUCCEEDED', 'FAILED')),
    -- A Failure Code exists exactly when the transaction FAILED.
    CONSTRAINT "provider_transaction_failure_code_iff_failed" CHECK (("status" = 'FAILED') = ("failure_code" IS NOT NULL)),
    -- completed_at is set exactly when the status is terminal.
    CONSTRAINT "provider_transaction_completed_at_iff_terminal" CHECK (("status" = 'PROCESSING') = ("completed_at" IS NULL))
);

-- The only arbiter of concurrent duplicates: one Provider Transaction per (Client, Idempotency Key).
CREATE UNIQUE INDEX "provider_transaction_client_id_idempotency_key_key"
    ON "provider_transaction" ("client_id", "idempotency_key");

-- Lookup by External Reference, oldest first. External Reference is deliberately not unique.
CREATE INDEX "provider_transaction_client_id_external_reference_created_at_idx"
    ON "provider_transaction" ("client_id", "external_reference", "created_at");

CREATE TABLE "provider_transaction_event" (
    "id" UUID NOT NULL,
    -- Insertion order: two events of one transaction may share a millisecond.
    "sequence" BIGINT GENERATED ALWAYS AS IDENTITY,
    "provider_transaction_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "failure_code" TEXT,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "provider_transaction_event_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "provider_transaction_event_sequence_key" UNIQUE ("sequence"),
    CONSTRAINT "provider_transaction_event_type_valid" CHECK ("type" IN ('transaction.processing', 'transaction.succeeded', 'transaction.failed')),
    CONSTRAINT "provider_transaction_event_status_valid" CHECK ("status" IN ('PROCESSING', 'SUCCEEDED', 'FAILED')),
    CONSTRAINT "provider_transaction_event_provider_transaction_id_fkey"
        FOREIGN KEY ("provider_transaction_id") REFERENCES "provider_transaction" ("id")
        ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX "provider_transaction_event_provider_transaction_id_sequence_idx"
    ON "provider_transaction_event" ("provider_transaction_id", "sequence");

-- AC-28: the event history is append-only; the database refuses to rewrite it.
CREATE FUNCTION "reject_provider_transaction_event_change"() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'provider_transaction_event is append-only: % is not allowed', TG_OP
        USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "provider_transaction_event_reject_update"
    BEFORE UPDATE ON "provider_transaction_event"
    FOR EACH ROW EXECUTE FUNCTION "reject_provider_transaction_event_change"();

CREATE TRIGGER "provider_transaction_event_reject_delete"
    BEFORE DELETE ON "provider_transaction_event"
    FOR EACH ROW EXECUTE FUNCTION "reject_provider_transaction_event_change"();
