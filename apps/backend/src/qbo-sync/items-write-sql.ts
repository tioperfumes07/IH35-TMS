/**
 * ACCT-F83 — the constraint-bearing SQL of the items write path (puller AND reconciler), isolated in a
 * module with NO runtime imports.
 *
 * THREE writes in this path could violate uq_items_company_item_name and abort their whole sync step.
 * All three were the same defect wearing different clothes, and each was proven on a fork of prod
 * before being changed (2026-08-02):
 *   1. reconciler HEAL  — `SET item_name = qi.name` renamed a '[QBO n]' twin onto a taken name.
 *                         LIVE FAILURE on TRANSP: items_reconcile had never once succeeded.
 *   2. reconciler INSERT — wrote qi.name raw while deduping only on qbo_item_id.
 *                         LIVE on TRK: mirror qbo_id 179 'Freight' vs local 'Freight' (qbo_id 12).
 *   3. puller INSERT     — same bare name, reached whenever ACCT-F77's adopt stands down because the
 *                         name is held by a row bound to a DIFFERENT qbo id. Reproduced on a fork:
 *                         same constraint, same TRK row.
 * #3988 fixed the puller's DO UPDATE rename and the class survived in its two siblings. Fixing only
 * the write that happened to be reported would have left the other two live.
 *
 * Why it lives apart from items-reconciler.ts: these two statements are the ones that can violate a
 * unique index and abort the whole sync step, so they are the ones that must be provable. With the SQL
 * inline in the reconciler, verifying it meant hand-copying the string into a psql session — and a
 * hand-copy proves the copy, not the code. Exported from a leaf module, the EXACT string the
 * application executes can be dumped and run against a fork of prod (scripts/dump-items-reconcile-sql.mjs),
 * asserted by a unit test, and pattern-checked by the CI guard. Same bytes in all four places.
 *
 * Schema facts below are verified live on the prod branch br-fancy-credit-akjnd07a (2026-08-02, read
 * under is_lucia_bypass with a positive control), NOT from migrations:
 *   uq_items_company_item_name  UNIQUE (operating_company_id, item_name)                  — NOT partial
 *   uq_items_company_item_code  UNIQUE (operating_company_id, item_code) WHERE code NOT NULL — partial
 *   uq_items_company_qbo_item_id UNIQUE (operating_company_id, qbo_item_id) WHERE id NOT NULL — partial
 *
 * item_name is therefore the only one of the three where EVERY write is constraint-bearing, which is
 * why it — and not the qbo_id the sync is actually keyed on — is what kept aborting the step.
 */

/**
 * The entity-scoped "is this display name free for this QBO item?" test, shared by the INSERT and the
 * HEAL path so the two can never disagree about what is safe to write.
 *
 * Two clauses, and BOTH are load-bearing:
 *   1. no OTHER catalogs.items row in this entity already holds the name — the cross-row collision
 *      that aborted items_reconcile on TRANSP;
 *   2. no OTHER mirror row in this entity carries the same QBO name — the INTRA-STATEMENT collision.
 *      Two QBO items sharing a name would otherwise both resolve to the same bare name inside a single
 *      statement, which no EXISTS check can catch: every subquery in one statement sees the
 *      pre-statement snapshot, so neither row can observe the other's write. Not hypothetical — TRK
 *      carries two live mirror rows both named 'Freight' (qbo_id 12 and 179), verified on prod.
 *
 * @param self SQL expression identifying the row being written: 'NULL' on the INSERT path (no self row
 *             exists yet, and `id IS DISTINCT FROM NULL` is true for every real row, so nothing is
 *             wrongly excluded); `ci.id` on the HEAL path, so a row never blocks its own rename.
 */
export function nameIsFree(self: "NULL" | "ci.id"): string {
  return `
  NOT EXISTS (
    SELECT 1 FROM catalogs.items other
     WHERE other.operating_company_id = qi.operating_company_id
       AND other.item_name = qi.name
       AND other.id IS DISTINCT FROM ${self}
  )
  AND NOT EXISTS (
    SELECT 1 FROM mdata.qbo_items peer
     WHERE peer.operating_company_id = qi.operating_company_id
       AND peer.name = qi.name
       AND peer.qbo_id IS DISTINCT FROM qi.qbo_id
  )`;
}

/**
 * The same test for item_code. uq_items_company_item_code is PARTIAL (WHERE item_code IS NOT NULL), so
 * NULL is always a safe landing value — which is why the INSERT cascade may end at NULL rather than
 * fabricating a code that would collide.
 *
 * @param opts.peerSkuCollides pass false where the candidate code is CONCAT('QBO-', qbo_id), which is
 *        unique by construction. The peer-sku clause guards against two mirror rows sharing a SKU;
 *        applying it to the fallback would push a perfectly safe code to NULL for no reason.
 */
export function codeIsFree(codeExpr: string, self: "NULL" | "ci.id", opts?: { peerSkuCollides?: boolean }): string {
  const peerClause =
    opts?.peerSkuCollides === false
      ? ""
      : `
  AND NOT EXISTS (
    SELECT 1 FROM mdata.qbo_items peer
     WHERE peer.operating_company_id = qi.operating_company_id
       AND peer.sku = qi.sku
       AND peer.qbo_id IS DISTINCT FROM qi.qbo_id
  )`;
  return `
  NOT EXISTS (
    SELECT 1 FROM catalogs.items other
     WHERE other.operating_company_id = qi.operating_company_id
       AND other.item_code = ${codeExpr}
       AND other.id IS DISTINCT FROM ${self}
  )${peerClause}`;
}

/**
 * The '[QBO n]' suffix is the convention ALREADY carried by prod rows ('Fuel Surcharge [QBO 24]',
 * 'Layover Charge [QBO 26]'), not one invented here. Reusing it keeps a single disambiguation shape in
 * the catalogue instead of introducing a second one the operator would have to learn.
 */
const DISAMBIGUATED_NAME = `qi.name || ' [QBO ' || qi.qbo_id || ']'`;

/**
 * ACCT-F83 — the puller's row-at-a-time equivalents of the two expressions above.
 *
 * The puller writes ONE row per statement from JS parameters ($1 opco, $2 name, $3 code, $6 qbo id)
 * rather than set-at-a-time from the mirror, so these take no `qi` alias and need no peer clause: each
 * inserted row is already visible to the next statement's EXISTS check, so a second QBO item with the
 * same name naturally sees the first and disambiguates. That is the one respect in which the
 * row-at-a-time shape is safer than the set-based one.
 *
 * This is reached when ACCT-F77's ADOPT stands down — the local row holding the name is bound to a
 * DIFFERENT qbo id, so it is not adoptable — and the ON CONFLICT arbiter cannot match either, because
 * that arbiter is (operating_company_id, qbo_item_id) and this qbo id has never been seen. The
 * statement therefore falls through to a genuine INSERT carrying a name another row already owns.
 */
const PULLER_ITEM_NAME_EXPR = `
      CASE WHEN NOT EXISTS (
        SELECT 1 FROM catalogs.items other
         WHERE other.operating_company_id = $1::uuid
           AND other.item_name = $2
      ) THEN $2 ELSE $2 || ' [QBO ' || $6 || ']' END`;

/** Same cascade as the reconciler's: sku -> 'QBO-<id>' -> NULL (safe, the code index is partial). */
const PULLER_ITEM_CODE_EXPR = `
      CASE
        WHEN NOT EXISTS (
          SELECT 1 FROM catalogs.items other
           WHERE other.operating_company_id = $1::uuid
             AND other.item_code = $3
        ) THEN $3
        WHEN NOT EXISTS (
          SELECT 1 FROM catalogs.items other
           WHERE other.operating_company_id = $1::uuid
             AND other.item_code = CONCAT('QBO-', $6)
        ) THEN CONCAT('QBO-', $6)
        ELSE NULL
      END`;

/**
 * The puller's per-row upsert.
 * $1 opco · $2 name · $3 sku-or-'QBO-<id>' · $4 item_type · $5 unit_price_cents · $6 qbo id ·
 * $7 default_expense_account_id · $8 notes · $9 deactivated_at · $10 active.
 *
 * VALUES, not INSERT…SELECT: with VALUES, Postgres infers each parameter's type from the target
 * column. In a SELECT list the untyped $5/$9 would resolve as unknown/text first, so a null price or
 * a Date would be a type error at execution rather than a clean insert. The disambiguation
 * expressions below are subqueries, which VALUES accepts.
 */
export const PULLER_UPSERT_ITEM_SQL = `
      INSERT INTO catalogs.items (
        operating_company_id,
        item_name,
        item_code,
        item_type,
        unit_price_cents,
        qbo_item_id,
        default_expense_account_id,
        notes,
        deactivated_at,
        qbo_synced_at,
        qbo_sync_status,
        qbo_sync_error
      )
      VALUES ($1, ${PULLER_ITEM_NAME_EXPR}, ${PULLER_ITEM_CODE_EXPR}, $4,$5,$6,$7::uuid,$8,$9,now(),'synced',NULL)
      ON CONFLICT (operating_company_id, qbo_item_id) WHERE qbo_item_id IS NOT NULL
      DO UPDATE SET
        -- ACCT-F77 — item_name is DELIBERATELY NOT overwritten on update.
        --
        -- On update the upsert used to rename the local twin to QBO's bare short name
        -- ('Fuel Surcharge [QBO 24]' -> 'Fuel Surcharge'), colliding with a native row of that name.
        -- The '[QBO nn]' suffix is INTENTIONAL disambiguation, not drift: it is how a QBO-sourced row
        -- coexists with a same-named local row. QBO owns the item's identity (qbo_item_id) and its
        -- economics (price, type, income account) — all still synced below. It does not own the local
        -- display name once that name is already taken.
        --
        -- ACCT-F83 — the INSERT arm above now disambiguates too. #3988 closed this DO UPDATE arm and
        -- stopped there; the INSERT arm kept writing $2 raw and stayed reachable, because ADOPT only
        -- claims a row whose qbo_item_id IS NULL. When the name is held by a row bound to a DIFFERENT
        -- qbo id, adoption correctly stands down, the arbiter cannot match an unseen qbo id, and the
        -- INSERT fired with a name already taken. Reproduced on a fork of prod 2026-08-02 with TRK
        -- qbo_id 179 'Freight' against local 'Freight' (qbo_id 12): same constraint, same abort.
        item_code = EXCLUDED.item_code,
        item_type = EXCLUDED.item_type,
        unit_price_cents = EXCLUDED.unit_price_cents,
        default_expense_account_id = COALESCE(EXCLUDED.default_expense_account_id, catalogs.items.default_expense_account_id),
        deactivated_at = CASE WHEN $10::boolean THEN NULL ELSE COALESCE(catalogs.items.deactivated_at, now()) END,
        qbo_synced_at = now(),
        qbo_sync_status = 'synced',
        qbo_sync_error = NULL,
        updated_at = now()
    `;

/**
 * $1 = operating_company_id, $2 = notes.
 *
 * Creates the local row for any mirrored QBO item that has none. Previously wrote qi.name RAW while
 * deduping only on qbo_item_id, so a QBO item whose NAME was already held by a different local row
 * aborted the entire step on uq_items_company_item_name.
 *
 * The row is CREATED (disambiguated), never skipped. Skipping is the more damaging choice:
 * accounting.invoice_lines carries no FK to catalogs.items and resolves revenue by joining on
 * qbo_item_id, so a QBO item with no local row leaves every line keyed to it unable to resolve an
 * income account, and the posting engine fails closed with ACCOUNT_MAPPING_MISSING. Two QBO items that
 * genuinely share a name are two real products; the catalogue must be able to hold both.
 */
export const CREATE_MISSING_ITEMS_SQL = `
      WITH inserted AS (
        INSERT INTO catalogs.items (
          operating_company_id,
          item_name,
          item_code,
          item_type,
          unit_price_cents,
          qbo_item_id,
          notes,
          deactivated_at,
          qbo_synced_at,
          qbo_sync_status
        )
        SELECT
          qi.operating_company_id,
          CASE WHEN ${nameIsFree("NULL")} THEN qi.name ELSE ${DISAMBIGUATED_NAME} END,
          CASE
            WHEN ${codeIsFree("COALESCE(qi.sku, CONCAT('QBO-', qi.qbo_id))", "NULL")}
              THEN COALESCE(qi.sku, CONCAT('QBO-', qi.qbo_id))
            WHEN ${codeIsFree("CONCAT('QBO-', qi.qbo_id)", "NULL", { peerSkuCollides: false })}
              THEN CONCAT('QBO-', qi.qbo_id)
            ELSE NULL
          END,
          CASE
            WHEN lower(trim(coalesce(qi.item_type, ''))) = 'inventory' THEN 'Inventory'
            WHEN lower(replace(trim(coalesce(qi.item_type, '')), ' ', '')) = 'noninventory' THEN 'NonInventory'
            WHEN lower(trim(coalesce(qi.item_type, ''))) = 'bundle' THEN 'Bundle'
            WHEN lower(trim(coalesce(qi.item_type, ''))) = 'discount' THEN 'Discount'
            ELSE 'Service'
          END,
          qi.unit_price_cents,
          qi.qbo_id,
          $2,
          CASE WHEN qi.active THEN NULL ELSE now() END,
          now(),
          'synced'
        FROM mdata.qbo_items qi
        WHERE qi.operating_company_id = $1::uuid
          AND qi.qbo_id IS NOT NULL
          AND NOT EXISTS (
            -- dedup MUST be entity-scoped: the same qbo_id can legitimately exist in another entity's
            -- catalogs.items; without ci.operating_company_id = qi.operating_company_id a colliding
            -- qbo_id in a DIFFERENT entity would suppress this entity's insert.
            SELECT 1 FROM catalogs.items ci
            WHERE ci.qbo_item_id = qi.qbo_id
              AND ci.operating_company_id = qi.operating_company_id
          )
        RETURNING 1
      )
      SELECT COUNT(*)::text AS c FROM inserted
    `;

/**
 * $1 = operating_company_id.
 *
 * THIS is the statement that failed on prod at 2026-08-02T01:00:04.085Z with "duplicate key value
 * violates unique constraint uq_items_company_item_name" for TRANSP (91e0bf0a), leaving
 * qbo_sync.step.items_reconcile with last_successful_run_at = NULL — it had never once succeeded.
 *
 * ROOT CAUSE: `SET item_name = qi.name` is the SAME unconditional rename that #3988 removed from the
 * puller's DO UPDATE, still live here one file over. #3988 fixed the write it was looking at; the class
 * survived in its sibling. Reproduced on a fork of prod before this change — the two '[QBO n]' twins
 * ('Fuel Surcharge [QBO 24]' -> 'Fuel Surcharge', 'Layover Charge [QBO 26]' -> 'Layover Charge') each
 * collide with the identically-named local row that holds no qbo_item_id.
 *
 * THE RULE, stated once: QBO owns the item's IDENTITY (qbo_item_id) and its ECONOMICS (price, sku,
 * type) — those always heal. It does NOT own the local display name once another row already holds
 * that name; the '[QBO n]' suffix is deliberate disambiguation, not drift. The rename therefore happens
 * when the name is genuinely free (converging on QuickBooks is this step's entire purpose) and stands
 * down when it is not. That is the only reading under which the step can ever converge.
 *
 * The free-test is in the WHERE as well as the SET, and that is not redundancy. With it only in the
 * SET, the two twins would match "name drift" on every run forever, be counted as `healed`, and change
 * nothing — a drift counter reporting permanent phantom work. A row is counted as healed only if this
 * statement actually changes it.
 *
 * item_code joins the WHERE for the first time. The SET already wrote it, so code drift was always
 * meant to heal, but could only ride along on a name/price match and never triggered on its own.
 */
export const HEAL_ITEM_DRIFT_SQL = `
      WITH healed AS (
        UPDATE catalogs.items ci
        SET
          item_name = CASE WHEN ${nameIsFree("ci.id")} THEN qi.name ELSE ci.item_name END,
          item_code = CASE
            WHEN ${codeIsFree("COALESCE(qi.sku, ci.item_code)", "ci.id")} THEN COALESCE(qi.sku, ci.item_code)
            ELSE ci.item_code
          END,
          unit_price_cents = qi.unit_price_cents,
          qbo_sync_status = 'synced',
          qbo_sync_error = NULL,
          qbo_synced_at = now(),
          updated_at = now()
        FROM mdata.qbo_items qi
        WHERE qi.operating_company_id = $1::uuid
          AND ci.operating_company_id = qi.operating_company_id
          AND qi.qbo_id = ci.qbo_item_id
          AND (
            ci.unit_price_cents IS DISTINCT FROM qi.unit_price_cents
            OR (ci.item_name IS DISTINCT FROM qi.name AND ${nameIsFree("ci.id")})
            OR (
              COALESCE(qi.sku, ci.item_code) IS DISTINCT FROM ci.item_code
              AND ${codeIsFree("COALESCE(qi.sku, ci.item_code)", "ci.id")}
            )
          )
        RETURNING 1
      )
      SELECT COUNT(*)::text AS c FROM healed
    `;

/**
 * $1 = operating_company_id.
 *
 * Counts the conflicts the heal deliberately declined to rename, so the step reports the state it is
 * actually in. Silence would read as "fully synced" while rows permanently hold a name QuickBooks
 * disagrees with — the same shape of dishonest telemetry as the inverted scoreboard fixed in #3990.
 */
export const COUNT_NAME_CONFLICTS_SQL = `
      SELECT COUNT(*)::text AS c
      FROM catalogs.items ci
      JOIN mdata.qbo_items qi
        ON qi.operating_company_id = ci.operating_company_id
       AND qi.qbo_id = ci.qbo_item_id
      WHERE qi.operating_company_id = $1::uuid
        AND ci.item_name IS DISTINCT FROM qi.name
        AND NOT (${nameIsFree("ci.id")})
    `;
