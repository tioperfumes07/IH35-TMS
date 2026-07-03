-- Block-19 B19-V1 — genesis-anchored chain_seq for events.event_log (audit tamper-verification foundation).
-- Design: docs/specs/BLOCK19-AUDIT-CHAIN-VERIFY.md §3 (owner-ratified GENESIS-ANCHOR, NO backfill).
--
-- WHY: the hash chain links prev_hash to MAX(occurred_at)-at-insert, but occurred_at is not monotonic with
-- insert order, so verification can't deterministically walk the chain. A monotonic insert-order sequence
-- fixes it. WORM invariant: existing audit rows are NEVER modified — chain_seq is populated ONLY on INSERT
-- (the append-only trigger), never backfilled. Pre-retrofit rows keep chain_seq=NULL and stay verifiable by
-- their existing prev_hash linkage + per-row hash recompute.
--
-- Tier-1 (ALTER on the immutable audit log). Idempotent. Money-free.

-- Global monotonic sequence — within any single company, chain_seq is strictly increasing in insert order,
-- which is all the per-company verification walk needs.
CREATE SEQUENCE IF NOT EXISTS events.event_log_chain_seq;
GRANT USAGE ON SEQUENCE events.event_log_chain_seq TO ih35_app;

-- ADD COLUMN only (DDL, not a row mutation — append-only immutability preserved). NULL for all existing rows;
-- NO backfill UPDATE (that would be a write against a WORM audit log).
ALTER TABLE events.event_log ADD COLUMN IF NOT EXISTS chain_seq bigint;

-- Deterministic walk of the post-anchor chain.
CREATE INDEX IF NOT EXISTS idx_event_log_chain_seq
  ON events.event_log (operating_company_id, chain_seq) WHERE chain_seq IS NOT NULL;

-- Trigger: unchanged append-only enforcement; on INSERT also stamp chain_seq (genesis anchor = first
-- nextval after deploy) and resolve prev_hash by the deterministic order (post-anchor rows by chain_seq
-- DESC, falling back to the pre-anchor chain head by occurred_at DESC so the first post-anchor event chains
-- continuously onto the old chain). The prev_hash/hash computation is otherwise identical to 202606111051.
CREATE OR REPLACE FUNCTION events.event_log_append_only_trigger()
RETURNS trigger AS $$
DECLARE
    v_prev_hash text;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'events.event_log is append-only: UPDATE not allowed. Create a correction event with event_type=''correction.appended'' referencing the original event_id instead.';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'events.event_log is append-only: DELETE not allowed.';
    END IF;

    IF TG_OP = 'INSERT' THEN
        -- Insert-order sequence (genesis-anchored; NULL only for pre-retrofit rows).
        NEW.chain_seq := nextval('events.event_log_chain_seq');

        -- Most recent event for this company: post-anchor rows first (chain_seq DESC), then the pre-anchor
        -- chain head (occurred_at DESC) — so the genesis event chains onto the existing chain.
        SELECT hash INTO v_prev_hash
        FROM events.event_log
        WHERE operating_company_id = NEW.operating_company_id
          AND is_active = true
        ORDER BY chain_seq DESC NULLS LAST, occurred_at DESC, event_id DESC
        LIMIT 1;

        NEW.prev_hash := v_prev_hash;
        NEW.hash := events.calculate_event_hash(
            v_prev_hash,
            NEW.event_id,
            NEW.occurred_at,
            NEW.actor_id,
            NEW.event_type,
            NEW.subject_id,
            NEW.payload
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS event_log_append_only ON events.event_log;
CREATE TRIGGER event_log_append_only
    BEFORE INSERT OR UPDATE OR DELETE ON events.event_log
    FOR EACH ROW
    EXECUTE FUNCTION events.event_log_append_only_trigger();
