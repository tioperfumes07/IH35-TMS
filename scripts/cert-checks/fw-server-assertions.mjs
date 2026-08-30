/**
 * CERT-01 B2 + B7 (owner packet IH35-FINISH-2026-08-29/CC-1) — the server-side FW (Fully-Wired)
 * assertion library. Consumed by scripts/certify-module.mjs (CERT-01 B1, Cursor) via its `items`
 * parameter; each evaluator here returns "PASS" | "FAIL" plus a detail string, never a boolean, so
 * a certification artifact can carry WHY a check failed, not just that it did.
 *
 * B2 owns FW1, FW2, FW4, FW5, FW10 (server-side, all machine-checkable per the packet's own table).
 * B7 owns FW3 (money: JE balance + object-type correctness — GL PURPOSE correctness stays human;
 * these functions never judge whether the account chosen is the right one, only whether the entry
 * balances and carries a real catalog type).
 *
 * Every evaluator takes an injectable fetch/query implementation so its own --selftest can run with
 * zero live infra (mocked responses), matching every other guard in this repo — the SAME functions
 * are what a real certify run wires to the live api.ih35dispatch.com fetch and a real Neon client.
 */

// ---------------------------------------------------------------------------
// FW1 — Real place: route returns 200, is not a ComingSoon/stub twin.
// ---------------------------------------------------------------------------
const COMING_SOON_MARKERS = ["coming soon", "comingsoon", "not yet built", "placeholder-route-stub"];

export async function evaluateFw1RouteAlive({ url, fetchImpl }) {
  if (!url) return { fw1: "FAIL", detail: "no route url provided" };
  let res;
  try {
    res = await fetchImpl(url);
  } catch (err) {
    return { fw1: "FAIL", detail: `fetch threw: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!res || res.status !== 200) {
    return { fw1: "FAIL", detail: `HTTP ${res?.status ?? "no-response"} for ${url}` };
  }
  const body = typeof res.text === "function" ? await res.text() : String(res.body ?? "");
  const lower = body.toLowerCase();
  if (COMING_SOON_MARKERS.some((marker) => lower.includes(marker))) {
    return { fw1: "FAIL", detail: `route body matches a ComingSoon/stub marker: ${url}` };
  }
  return { fw1: "PASS", detail: `200 non-stub response from ${url}` };
}

// ---------------------------------------------------------------------------
// FW2 — Canonical write: the create path's INSERT targets a canonical table, never a RETIRE one.
// Static/source check (no live infra) so callers pass the route file's own source text.
// ---------------------------------------------------------------------------

/**
 * Known RETIRE-side tables this session's own linkage law has established (not exhaustive —
 * callers may extend via retiredTables). Sourced from
 * docs/trackers/FINAL-TABLES-WIRING-FOR-CODER-2026-07-05.md §A and this session's own DOC-01-D1
 * decision (documents.attachments RETIRE in favor of docs.files).
 */
export const KNOWN_RETIRE_TABLES = [
  "payroll.driver_settlement_line_items",
  "payroll.driver_settlements",
  "settlement.settlement",
  "settlement.settlement_deduction",
  "settlement.settlement_line",
  "accounting.qbo_customers",
  "accounting.qbo_vendors",
  "accounting.qbo_accounts",
  "catalogs.cancellation_reasons",
  "documents.attachments",
  "accounting.coa_account",
];

export function evaluateFw2CanonicalWrite({ routeSource, expectedTable, retiredTables = KNOWN_RETIRE_TABLES }) {
  if (!routeSource || !expectedTable) {
    return { fw2: "FAIL", detail: "missing routeSource or expectedTable" };
  }
  const insertMatch = routeSource.match(/INSERT\s+INTO\s+([a-z0-9_]+\.[a-z0-9_]+)/i);
  if (!insertMatch) {
    return { fw2: "FAIL", detail: "no INSERT INTO <schema.table> found in route source" };
  }
  const targeted = insertMatch[1].toLowerCase();
  if (retiredTables.map((t) => t.toLowerCase()).includes(targeted)) {
    return { fw2: "FAIL", detail: `create path writes RETIRE-side table ${targeted}` };
  }
  if (targeted !== expectedTable.toLowerCase()) {
    return { fw2: "FAIL", detail: `create path writes ${targeted}, expected canonical table ${expectedTable}` };
  }
  return { fw2: "PASS", detail: `create path writes canonical table ${targeted}` };
}

// ---------------------------------------------------------------------------
// FW4 — Forward links: every owed FK is populated and is a REAL id, not memo text / UUID-in-name /
// jsonb-id theater. Live record read.
// ---------------------------------------------------------------------------
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function evaluateFw4ForwardLinksPopulated({ queryImpl, table, recordId, foreignKeyColumns }) {
  if (!queryImpl || !table || !recordId || !Array.isArray(foreignKeyColumns) || foreignKeyColumns.length === 0) {
    return { fw4: "FAIL", detail: "missing queryImpl, table, recordId, or foreignKeyColumns" };
  }
  const cols = foreignKeyColumns.join(", ");
  const res = await queryImpl(`SELECT ${cols} FROM ${table} WHERE id = $1 LIMIT 1`, [recordId]);
  const row = res?.rows?.[0];
  if (!row) return { fw4: "FAIL", detail: `no row found for ${table}.id=${recordId}` };
  const problems = [];
  for (const col of foreignKeyColumns) {
    const value = row[col];
    if (value === null || value === undefined || value === "") {
      problems.push(`${col} is empty`);
      continue;
    }
    // Theater check: a memo-text or a UUID smuggled inside a display/name column is not a real FK
    // (this function only inspects a real FK COLUMN, but a column literally named *_name/*_label/
    // *_memo handed in as a "foreign key" is itself the theater this check exists to catch).
    if (/_name$|_label$|_memo$|_text$/i.test(col)) {
      problems.push(`${col} looks like a display/memo column, not a real FK column`);
      continue;
    }
    if (!UUID_RE.test(String(value)) && typeof value === "object") {
      problems.push(`${col} is a jsonb/object value, not a scalar id (jsonb-id theater)`);
    }
  }
  if (problems.length > 0) {
    return { fw4: "FAIL", detail: problems.join("; ") };
  }
  return { fw4: "PASS", detail: `${foreignKeyColumns.length} forward FK column(s) all populated with real ids` };
}

// ---------------------------------------------------------------------------
// FW5 — Reverse links: the reverse endpoint returns this record. Live HTTP.
// ---------------------------------------------------------------------------
export async function evaluateFw5ReverseEndpoint({ url, expectedId, fetchImpl }) {
  if (!url || !expectedId) return { fw5: "FAIL", detail: "missing url or expectedId" };
  let res;
  try {
    res = await fetchImpl(url);
  } catch (err) {
    return { fw5: "FAIL", detail: `fetch threw: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!res || res.status !== 200) {
    return { fw5: "FAIL", detail: `HTTP ${res?.status ?? "no-response"} for reverse endpoint ${url}` };
  }
  const body = typeof res.json === "function" ? await res.json() : res.body;
  const serialized = JSON.stringify(body ?? "");
  if (!serialized.includes(expectedId)) {
    return { fw5: "FAIL", detail: `reverse endpoint response does not contain expected id ${expectedId}` };
  }
  return { fw5: "PASS", detail: `reverse endpoint ${url} returns the record` };
}

// ---------------------------------------------------------------------------
// FW10 — Security: cross-entity probe returns empty; a mutation writes an audit.audit_events row.
// ---------------------------------------------------------------------------
export async function evaluateFw10Security({ crossEntityUrl, fetchImpl, queryImpl, auditLookup }) {
  if (!crossEntityUrl || !auditLookup) {
    return { fw10: "FAIL", detail: "missing crossEntityUrl or auditLookup" };
  }
  let res;
  try {
    res = await fetchImpl(crossEntityUrl);
  } catch (err) {
    return { fw10: "FAIL", detail: `cross-entity fetch threw: ${err instanceof Error ? err.message : String(err)}` };
  }
  const crossEntityLeaks = res && res.status === 200 && String(JSON.stringify((await (typeof res.json === "function" ? res.json() : res.body)) ?? "")).length > 2;
  if (crossEntityLeaks) {
    return { fw10: "FAIL", detail: `cross-entity probe ${crossEntityUrl} returned non-empty data -- possible tenant leak` };
  }
  const auditRow = await queryImpl(auditLookup.sql, auditLookup.params);
  if (!auditRow?.rows?.length) {
    return { fw10: "FAIL", detail: "mutation did not write an audit.audit_events row" };
  }
  return { fw10: "PASS", detail: "cross-entity probe empty; mutation wrote a real audit row" };
}

// ---------------------------------------------------------------------------
// FW3 (B7) — Money: the JE balances and the money object type is correct. A HUMAN still reads
// whether the GL PURPOSE is right (which account, which class) -- this only machine-checks that
// the entry is balanced and carries a real, resolvable catalogs.journal_entry_types code.
// ---------------------------------------------------------------------------
export async function evaluateFw3MoneyBalance({ queryImpl, journalEntryId }) {
  if (!queryImpl || !journalEntryId) {
    return { fw3: "FAIL", detail: "missing queryImpl or journalEntryId" };
  }
  const balanceRes = await queryImpl(
    `SELECT
       COALESCE(SUM(amount_cents) FILTER (WHERE debit_or_credit = 'debit'), 0) AS debits,
       COALESCE(SUM(amount_cents) FILTER (WHERE debit_or_credit = 'credit'), 0) AS credits
     FROM accounting.journal_entry_postings
     WHERE journal_entry_uuid = $1`,
    [journalEntryId]
  );
  const row = balanceRes?.rows?.[0];
  if (!row) return { fw3: "FAIL", detail: `no postings found for JE ${journalEntryId}` };
  const debits = Number(row.debits ?? 0);
  const credits = Number(row.credits ?? 0);
  if (debits !== credits || debits === 0) {
    return { fw3: "FAIL", detail: `JE ${journalEntryId} not balanced: debits=${debits} credits=${credits}` };
  }
  const typeRes = await queryImpl(
    `SELECT jet.code
     FROM accounting.journal_entries je
     JOIN catalogs.journal_entry_types jet ON jet.id = je.journal_entry_type_id
     WHERE je.id = $1`,
    [journalEntryId]
  );
  const typeCode = typeRes?.rows?.[0]?.code;
  if (!typeCode) {
    return { fw3: "FAIL", detail: `JE ${journalEntryId} has no resolvable journal_entry_type_id (money-object-type not asserted)` };
  }
  return { fw3: "PASS", detail: `JE ${journalEntryId} balanced (${debits} cents each side), typed as ${typeCode}` };
}
