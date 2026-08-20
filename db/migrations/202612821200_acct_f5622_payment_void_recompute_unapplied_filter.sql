-- FINDING: ACCT-F5622 — voiding a customer payment does not revert the invoice's paid status.
--
-- ROOT CAUSE: apps/backend/src/accounting/payments.routes.ts's POST /:id/void route correctly
-- soft-unapplies a voided payment's accounting.payment_applications rows (sets unapplied_at, per the
-- void-not-delete rule) and correctly reverses the GL journal entry. That UPDATE re-fires the AFTER
-- UPDATE trigger pmt_app_recompute_invoice -> accounting.recompute_invoice_paid(), and the sibling
-- pmt_app_recompute_payment -> accounting.recompute_payment_applied(). BOTH functions' SUM(amount_cents)
-- queries have no "unapplied_at IS NULL" predicate, so voiding a payment recomputes the EXACT SAME
-- total as before the void — accounting.invoices.amount_paid_cents/status and
-- accounting.payments.amount_applied_cents never change. A voided payment leaves its invoice
-- permanently mismarked paid/partial while the GL correctly shows the receivable restored, so the
-- invoice silently drops out of every open-A/R surface (AR aging, the idx_invoices_open partial index,
-- collections/dunning queries) even though the customer still owes the money.
--
-- CANONICAL-CHECK: docs/audit/void-predicate-map.json already declares "unapplied_at IS NULL" as the
-- canonical predicate for accounting.payment_applications — this migration wires that predicate into
-- the two trigger functions that never picked it up. Confirmed live on Neon prod via
-- pg_get_functiondef that the deployed functions carry no such filter before this migration.
--
-- FIX: CREATE OR REPLACE both functions, unchanged except adding "AND unapplied_at IS NULL" to each
-- SUM query. Every other line (status derivation CASE, column list, trigger wiring) is byte-identical
-- to the live prod definition, reproduced from a direct pg_get_functiondef read, not retyped from an
-- old migration file, so no other behavior can silently drift.
--
-- IDEMPOTENT: CREATE OR REPLACE FUNCTION is naturally idempotent; no DROP needed. FRESH-DB SAFE: both
-- functions and their triggers already exist by this point in the chain (0060); this migration only
-- redefines the function bodies. NO RLS/GRANT CHANGE.

CREATE OR REPLACE FUNCTION accounting.recompute_invoice_paid()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_invoice_id uuid;
  v_new_invoice_id uuid := NULL;
  v_old_invoice_id uuid := NULL;
  v_paid bigint;
BEGIN
  IF TG_OP <> 'DELETE' THEN
    v_new_invoice_id := NEW.invoice_id;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    v_old_invoice_id := OLD.invoice_id;
  END IF;

  FOR v_invoice_id IN
    SELECT DISTINCT x.invoice_id
    FROM (VALUES (v_new_invoice_id), (v_old_invoice_id)) AS x(invoice_id)
    WHERE x.invoice_id IS NOT NULL
  LOOP
    SELECT COALESCE(SUM(amount_cents), 0)::bigint
      INTO v_paid
    FROM accounting.payment_applications
    WHERE invoice_id = v_invoice_id
      -- ACCT-F5622: exclude voided (unapplied) applications so a payment void reverts the invoice's
      -- paid status instead of silently recomputing the same total.
      AND unapplied_at IS NULL;

    UPDATE accounting.invoices i
    SET
      amount_paid_cents = v_paid,
      status = CASE
        WHEN i.status = 'void' THEN 'void'
        WHEN i.status = 'factored' THEN 'factored'
        WHEN v_paid >= i.total_cents AND i.total_cents > 0 THEN 'paid'
        WHEN v_paid > 0 THEN 'partial'
        WHEN i.status IN ('partial', 'paid') THEN 'sent'
        ELSE i.status
      END,
      updated_at = now()
    WHERE i.id = v_invoice_id;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION accounting.recompute_payment_applied()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_payment_id uuid;
  v_new_payment_id uuid := NULL;
  v_old_payment_id uuid := NULL;
  v_applied bigint;
BEGIN
  IF TG_OP <> 'DELETE' THEN
    v_new_payment_id := NEW.payment_id;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    v_old_payment_id := OLD.payment_id;
  END IF;

  FOR v_payment_id IN
    SELECT DISTINCT x.payment_id
    FROM (VALUES (v_new_payment_id), (v_old_payment_id)) AS x(payment_id)
    WHERE x.payment_id IS NOT NULL
  LOOP
    SELECT COALESCE(SUM(amount_cents), 0)::bigint
      INTO v_applied
    FROM accounting.payment_applications
    WHERE payment_id = v_payment_id
      -- ACCT-F5622: same fix as recompute_invoice_paid() above — a voided application must not
      -- keep counting toward the payment's amount_applied_cents.
      AND unapplied_at IS NULL;

    UPDATE accounting.payments p
    SET amount_applied_cents = v_applied
    WHERE p.id = v_payment_id;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$function$;
