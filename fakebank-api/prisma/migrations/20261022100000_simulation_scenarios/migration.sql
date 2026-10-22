-- Simulation Scenarios (T6): one per (Client, External Reference); registering again replaces it.

CREATE TABLE "simulation_scenario" (
    "client_id" TEXT NOT NULL,
    "external_reference" VARCHAR(128) NOT NULL,
    "outcome" TEXT NOT NULL,
    -- Applied after persistence (T8); 0 means answer immediately.
    "delay_ms" INTEGER NOT NULL,
    "failure_code" TEXT,
    -- Only for RATE_LIMIT; NULL means the default Retry-After (T8).
    "retry_after_seconds" INTEGER,
    -- Attempts this scenario still affects; consumed by one conditional decrement (> 0).
    "remaining_attempts" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "simulation_scenario_pkey" PRIMARY KEY ("client_id", "external_reference"),
    CONSTRAINT "simulation_scenario_outcome_valid" CHECK ("outcome" IN ('SUCCEED', 'FAIL', 'DEFERRED', 'RATE_LIMIT', 'ERROR_BEFORE_COMMIT', 'ERROR_AFTER_COMMIT')),
    CONSTRAINT "simulation_scenario_delay_ms_range" CHECK ("delay_ms" BETWEEN 0 AND 120000),
    -- A Failure Code exists exactly for FAIL.
    CONSTRAINT "simulation_scenario_failure_code_iff_fail" CHECK (("outcome" = 'FAIL') = ("failure_code" IS NOT NULL)),
    CONSTRAINT "simulation_scenario_retry_after_only_rate_limit" CHECK ("retry_after_seconds" IS NULL OR ("outcome" = 'RATE_LIMIT' AND "retry_after_seconds" BETWEEN 1 AND 3600)),
    CONSTRAINT "simulation_scenario_remaining_attempts_range" CHECK ("remaining_attempts" BETWEEN 0 AND 100)
);

-- The Outcome a Provider Transaction was created with is diagnostic only; keep it to known values.
ALTER TABLE "provider_transaction"
    ADD CONSTRAINT "provider_transaction_applied_outcome_valid" CHECK ("applied_outcome" IS NULL OR "applied_outcome" IN ('SUCCEED', 'FAIL', 'DEFERRED', 'RATE_LIMIT', 'ERROR_BEFORE_COMMIT', 'ERROR_AFTER_COMMIT'));
