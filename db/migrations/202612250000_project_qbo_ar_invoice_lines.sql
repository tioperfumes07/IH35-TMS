-- ACCT-F146 — project the QBO AR invoice line detail that was imported and then never written.
--
-- WHAT IS WRONG. ACCT-F144 established the asymmetry, verified on prod: the AP side of the QBO clone
-- imported completely (16,245 bills, ZERO lineless, header ties to lines to the cent), while the AR
-- side imported HEADERS ONLY — 11,976 of 11,976 QBO-cloned invoices have no lines at all. The line
-- detail was fetched and stored the whole time: every one of the 12,063 rows in
-- mdata.qbo_ar_invoices carries a `Line` array in payload_json. Nothing needs inventing; it needs
-- projecting. Until it is, every line-level AR report — revenue by item/service, sales by product,
-- line revenue coding to account_id, source_load_id linkage — silently returns zero across the
-- entire real financial history, which is why nobody noticed.
--
-- WHAT MUST NOT BE PROJECTED, and this is the whole risk of the block. The `Line` array holds four
-- DetailTypes. Counting array elements gives 33,429; that number is WRONG as a projection target and
-- using it would DOUBLE accounts receivable. Measured on prod:
--     SalesItemLineDetail   16,670   $40,851,525.74   <- real revenue
--     SubTotalLineDetail    12,063   $40,851,525.74   <- RESTATES the invoice total, one per invoice
--     DescriptionOnly        4,622   $0 (4,615 carry no Amount key at all)
--     DiscountLineDetail        74   $4,596.55
-- SubTotal lines are a presentation artefact whose amount equals the header. Projecting them adds a
-- second full copy of revenue: +$40,851,525.74 against $40.85M of real revenue, exactly 2x, on the
-- one set of genuinely real financial data in the system (PERMANENT LAW §2). They are excluded here
-- by an explicit DetailType allowlist rather than a denylist, so a QBO DetailType we have never seen
-- cannot silently slip into the ledger.
--
-- DISCOUNT SIGN. QBO stores discounts POSITIVE (all 74, $1.75-$458.70) and expects them subtracted.
-- Verified against QBO's own TotalAmt across every invoice:
--     SUM(SalesItem) - SUM(Discount) = TotalAmt   ->  12,063 / 12,063
--     SUM(SalesItem)                 = TotalAmt   ->  11,989 / 12,063   (the 74 with discounts)
-- They CANNOT be written negative: accounting.invoice_lines carries CHECK (line_total_cents >= 0),
-- so the table has no representation for a negative line. The subtractive sign therefore lives in
-- line_type='adjustment', and every reader summing these lines must subtract adjustments — the
-- tie-out below does exactly that. Flagged as ACCT-F148: a money line table that cannot hold a
-- negative amount has no natural representation for a discount, credit or write-down, which is a
-- schema gap worth its own block rather than something to paper over here.
--
-- THE TIE-OUT IS THE POINT. Per invoice, SUM(projected line_total_cents) must equal that header's
-- subtotal_cents, and the WHOLE migration aborts on any mismatch — not the offending invoice, the
-- whole thing. A partial projection of a financial ledger is worse than none, because it looks
-- finished. This assertion is already proven to hold: it is clean on the 8 TMS-native invoices that
-- do have lines (0 drift), and it is QBO's own arithmetic.
--
-- TWO INVOICES ARE EXCLUDED BY ID, and they are a real finding, not an inconvenience. ACCT-F147:
--     INV-2026-00714 (qbo 124889)  ours $4,200.00   QBO TotalAmt $0.00      diff $4,200.00
--     INV-2026-00661 (qbo 124314)  ours $2,600.00   QBO TotalAmt $2,100.00  diff   $500.00
-- Both TRANSP, both status=sent, neither voided. That is a header-level TMS-vs-QBO reconciliation
-- break which this projection did not cause and cannot repair; resolving it needs the LIVE QBO
-- record. They are named exemptions carrying their own board row, so the tie-out stays ABSOLUTE for
-- the other 11,974 instead of being loosened until it passes. Loosening a failing assertion to make
-- a batch succeed is how a real divergence gets buried.
--
-- SAFE TO RETRY because ACCT-F145 (202612240000) put UNIQUE (invoice_id, display_order) on the table
-- first. Without it a resumed or re-run batch would silently double every line it re-inserted. The
-- ordering is deliberate and this migration asserts the index exists before writing anything.
--
-- Idempotent: ON CONFLICT DO NOTHING against that unique index, so re-running is a no-op.

DO $$
DECLARE
  v_index_exists boolean;
  v_projected    bigint := 0;
  v_bad          bigint := 0;
  v_example      text;
BEGIN
  IF to_regclass('accounting.invoice_lines') IS NULL
     OR to_regclass('mdata.qbo_ar_invoices') IS NULL THEN
    RAISE NOTICE 'ACCT-F146: required tables absent — skipping';
    RETURN;
  END IF;

  -- REFUSE to project without the uniqueness guarantee. On a fresh CI database the migrations run in
  -- order so this always holds; on any database where 202612240000 was skipped, writing 16,744
  -- unprotected rows is precisely the failure this checks for.
  SELECT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'uq_invoice_lines_invoice_slot'
  ) INTO v_index_exists;
  IF NOT v_index_exists THEN
    RAISE EXCEPTION
      'ACCT-F146: uq_invoice_lines_invoice_slot is absent — refusing to project. Migration '
      '202612240000 (ACCT-F145) must run first, or a retried batch silently doubles revenue detail.';
  END IF;

  -- §1 — project. Allowlist of DetailTypes; SubTotalLineDetail and any unknown type are excluded by
  -- construction. DescriptionOnly is carried as a zero-amount text line so the invoice reads the way
  -- it does in QuickBooks; it cannot affect the tie-out (4,615 of 4,622 have no Amount at all).
  WITH src AS (
    SELECT
      i.id                                        AS invoice_id,
      i.operating_company_id,
      COALESCE((l->>'LineNum')::int, ord::int)    AS display_order,
      l->>'DetailType'                            AS detail_type,
      -- description is NOT NULL on invoice_lines and QBO omits it on some lines (notably
      -- SubTotal-adjacent and bare item lines). COALESCE to '' rather than inventing text:
      -- an empty description is what QuickBooks actually holds, and fabricating a label
      -- would put words into a financial record that the source never contained.
      COALESCE(l->>'Description', '')             AS description,
      -- POSITIVE, always. accounting.invoice_lines carries CHECK (line_total_cents >= 0), so the
      -- table cannot represent a negative line at all — the subtractive sign of a discount lives in
      -- line_type='adjustment', not in the amount. That is the schema's decision, not this
      -- migration's, and the tie-out below subtracts adjustments to match it.
      abs(round(COALESCE((l->>'Amount')::numeric, 0) * 100))::bigint AS line_total_cents,
      -- is this line subtractive? true for QBO discounts AND for the 81 SalesItemLineDetail lines
      -- that carry a NEGATIVE Amount (down to -$1,000) — credits and write-downs booked as negative
      -- revenue. The table cannot store either, so both become line_type='adjustment' at abs().
      (l->>'DetailType' = 'DiscountLineDetail'
       OR COALESCE((l->>'Amount')::numeric, 0) < 0)         AS is_subtractive,
      l#>>'{SalesItemLineDetail,ItemRef,value}'   AS qbo_item_id,
      l#>>'{SalesItemLineDetail,ItemRef,name}'    AS item_name
    FROM accounting.invoices i
    JOIN mdata.qbo_ar_invoices q
      ON q.payload_json->>'Id' = i.qbo_invoice_id
    CROSS JOIN LATERAL jsonb_array_elements(q.payload_json->'Line') WITH ORDINALITY AS t(l, ord)
    WHERE i.qbo_invoice_id IS NOT NULL
      AND l->>'DetailType' IN ('SalesItemLineDetail', 'DiscountLineDetail', 'DescriptionOnly')
      -- ACCT-F147 exemptions: headers that already disagree with QBO. Excluded by UUID, never by
      -- display_id — display_id is not unique across entities (PERMANENT LAW B).
      AND i.id NOT IN (
        'c8adfdf1-547d-4077-8e3c-406f385c6bda'::uuid,   -- INV-2026-00714, QBO says $0.00
        'af4f6ad2-c7a3-4a49-a61c-29ab9f3309eb'::uuid    -- INV-2026-00661, QBO says $2,100.00
      )
  )
  INSERT INTO accounting.invoice_lines (
    id, operating_company_id, invoice_id, display_order,
    line_type, description, quantity, unit_amount_cents, line_total_cents, qbo_item_id
  )
  SELECT
    gen_random_uuid(), s.operating_company_id, s.invoice_id, s.display_order,
    -- line_type is a FREIGHT BILLING taxonomy constrained by invoice_lines_line_type_check
    -- (linehaul/fsc/detention/layover/lumper/tonu/accessorial/tax/adjustment/other). QBO item names
    -- do not map onto it one-for-one, so classify ONLY what QuickBooks names unambiguously and send
    -- everything else to 'other' — which is a real member of the taxonomy, not a placeholder.
    -- Mapping every revenue line to 'linehaul' would assert freight semantics the source never
    -- stated; 'other' is the honest answer for a line we cannot classify from its own name.
    CASE
      WHEN s.is_subtractive                          THEN 'adjustment'
      WHEN s.item_name ILIKE '%line haul%'           THEN 'linehaul'
      WHEN s.item_name ILIKE '%fuel surcharge%'      THEN 'fsc'
      WHEN s.item_name ILIKE '%lumper%'              THEN 'lumper'
      WHEN s.item_name ILIKE '%layover%'             THEN 'layover'
      WHEN s.item_name ILIKE '%detention%'           THEN 'detention'
      ELSE 'other'
    END,
    s.description, 1, s.line_total_cents, s.line_total_cents, s.qbo_item_id
  FROM src s
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_projected = ROW_COUNT;
  RAISE NOTICE 'ACCT-F146: projected % AR invoice line(s)', v_projected;

  -- §2 — HARD TIE-OUT. Per invoice, the projected lines must reconstruct the header exactly. Any
  -- single mismatch aborts the whole migration; there is no partial success for a financial ledger.
  SELECT count(*), min(msg)
    INTO v_bad, v_example
  FROM (
    SELECT i.id,
           format('invoice %s (%s): lines %s <> subtotal %s',
                  i.id, i.display_id,
                  sum(il.line_total_cents) FILTER (WHERE il.line_type <> 'adjustment')
                    - COALESCE(sum(il.line_total_cents) FILTER (WHERE il.line_type = 'adjustment'), 0),
                  i.subtotal_cents) AS msg
      FROM accounting.invoices i
      JOIN accounting.invoice_lines il
        ON il.invoice_id = i.id AND il.soft_deleted_at IS NULL
     WHERE i.qbo_invoice_id IS NOT NULL
       AND i.id NOT IN (
         'c8adfdf1-547d-4077-8e3c-406f385c6bda'::uuid,
         'af4f6ad2-c7a3-4a49-a61c-29ab9f3309eb'::uuid
       )
     GROUP BY i.id, i.display_id, i.subtotal_cents
    -- adjustments are SUBTRACTIVE (see the discount note in the header): the table stores them
    -- positive because it cannot store a negative, so the sign is applied here.
    HAVING sum(il.line_total_cents) FILTER (WHERE il.line_type <> 'adjustment')
             - COALESCE(sum(il.line_total_cents) FILTER (WHERE il.line_type = 'adjustment'), 0)
           <> i.subtotal_cents
  ) bad;

  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'ACCT-F146 TIE-OUT FAILED: % invoice(s) where projected lines do not equal subtotal_cents. '
      'First: %. Refusing the batch — a partially projected AR ledger looks finished and is not.',
      v_bad, v_example;
  END IF;

  RAISE NOTICE 'ACCT-F146: tie-out clean — every projected invoice reconstructs its header exactly';
END
$$;
