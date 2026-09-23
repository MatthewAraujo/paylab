-- Ledger integrity enforced by PostgreSQL itself (ADR 0003).
--
-- Hand-written SQL: Prisma does not model functions or triggers. Migrations are
-- the source of truth; never regenerate this file from the Prisma schema.
--
-- Invariants enforced here:
--   1. Every Ledger Transaction has at least two Ledger Entries.
--   2. The entries of a Ledger Transaction balance to zero
--      (debits counted positive, credits negative).
--   3. Ledger Entries and Ledger Transactions are append-only: no UPDATE, no DELETE.
--
-- Deliberately NOT covered: TRUNCATE. Row-level triggers do not fire on TRUNCATE,
-- and the test helper relies on it to reset the database between tests. Production
-- roles must not be granted TRUNCATE on the ledger tables.

-- 1 and 2: checked at COMMIT, once all entries of the transaction are in.
--
-- The trigger is a deferred constraint trigger on both tables, so it works
-- whether entries are inserted in one statement or across many, and whichever
-- of the transaction row or its entries is inserted first. The function reads the
-- whole transaction, so it is idempotent: it may run several times per commit.
-- Summing in numeric avoids any overflow of the 64-bit amounts.
CREATE FUNCTION ledger_assert_transaction_balanced() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target_id   uuid;
  entry_count bigint;
  net         numeric;
BEGIN
  IF TG_TABLE_NAME = 'ledger_transactions' THEN
    target_id := NEW.id;
  ELSE
    target_id := NEW.ledger_transaction_id;
  END IF;

  SELECT count(*),
         coalesce(sum(CASE direction WHEN 'DEBIT' THEN amount ELSE -amount END), 0)
    INTO entry_count, net
    FROM ledger_entries
   WHERE ledger_transaction_id = target_id;

  IF entry_count < 2 THEN
    RAISE EXCEPTION 'ledger transaction % must have at least two entries, found %', target_id, entry_count
      USING ERRCODE = 'check_violation';
  END IF;

  IF net <> 0 THEN
    RAISE EXCEPTION 'ledger transaction % is unbalanced: debits minus credits is %', target_id, net
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ledger_transactions_balanced
  AFTER INSERT ON ledger_transactions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION ledger_assert_transaction_balanced();

CREATE CONSTRAINT TRIGGER ledger_entries_balanced
  AFTER INSERT ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION ledger_assert_transaction_balanced();

-- 3: immutability. A correction is always a new compensating Ledger Transaction.
CREATE FUNCTION ledger_reject_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% on % is not allowed: the ledger is append-only', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER ledger_entries_immutable
  BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION ledger_reject_mutation();

CREATE TRIGGER ledger_transactions_immutable
  BEFORE UPDATE OR DELETE ON ledger_transactions
  FOR EACH ROW EXECUTE FUNCTION ledger_reject_mutation();
