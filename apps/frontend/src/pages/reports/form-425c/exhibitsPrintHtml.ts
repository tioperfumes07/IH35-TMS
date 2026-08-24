type ExhibitLetter = "a" | "b" | "c" | "d" | "e" | "f";

export type BuiltExhibitsPrint = {
  filing_uuid: string;
  period_start: string;
  period_end: string;
  exhibits: Record<ExhibitLetter, Record<string, unknown>>;
};

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function moneyCents(cents: unknown): string {
  // F425C-EXHIBIT-C-UNVERIFIED-OPENING-FEEDS-TOTAL: Number(null) is 0, not NaN — without this
  // explicit check, a genuinely unavailable (null) balance would print as an honest-looking
  // "$0.00" instead of the "—" this exhibit already uses elsewhere for an unresolved value.
  if (cents === null || cents === undefined) return "—";
  const n = Number(cents);
  if (!Number.isFinite(n)) return "—";
  return (n / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function tableFromRows(rows: unknown, preferredKeys: string[]): string {
  if (!Array.isArray(rows) || rows.length === 0) {
    return `<p>No rows</p>`;
  }
  const first = rows[0] && typeof rows[0] === "object" ? (rows[0] as Record<string, unknown>) : {};
  const keys = preferredKeys.filter((k) => k in first);
  const cols = keys.length ? keys : Object.keys(first);
  const head = cols.map((k) => `<th>${esc(k)}</th>`).join("");
  const body = rows
    .map((row) => {
      const rec = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
      return `<tr>${cols
        .map((k) => {
          const v = rec[k];
          const cell = String(k).endsWith("_cents") ? moneyCents(v) : esc(v);
          return `<td>${cell}</td>`;
        })
        .join("")}</tr>`;
    })
    .join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function exhibitSection(letter: ExhibitLetter, payload: Record<string, unknown>): string {
  const title = esc(payload.title ?? `Exhibit ${letter.toUpperCase()}`);
  const parts: string[] = [`<h2>Exhibit ${letter.toUpperCase()} — ${title}</h2>`];
  if (Array.isArray(payload.rows)) {
    parts.push(
      tableFromRows(payload.rows, ["source_label", "vendor_name", "category", "txn_count", "amount_cents"]),
    );
  }
  if (Array.isArray(payload.accounts)) {
    parts.push(
      tableFromRows(payload.accounts, [
        "account_label",
        "opening_balance_cents",
        "inflows_cents",
        "outflows_cents",
        "closing_balance_cents",
        "opening_balance_source",
      ]),
    );
  }
  if (Array.isArray(payload.documents)) {
    parts.push(tableFromRows(payload.documents, ["doc_type", "label", "reference_id", "doc_date", "amount_cents"]));
  }
  if (Array.isArray(payload.snapshots)) {
    for (const snap of payload.snapshots) {
      const rec = snap && typeof snap === "object" ? (snap as Record<string, unknown>) : {};
      parts.push(`<h3>${esc(rec.label ?? rec.report)}</h3>`);
      const summary = rec.summary && typeof rec.summary === "object" ? (rec.summary as Record<string, unknown>) : {};
      const rows = Object.entries(summary).map(([k, v]) => ({ metric: k, amount: v }));
      parts.push(tableFromRows(rows, ["metric", "amount"]));
    }
  }
  if (payload.total_cents != null) parts.push(`<p><strong>Total</strong> ${moneyCents(payload.total_cents)}</p>`);
  if (payload.total_closing_cents != null) {
    const excluded = Number(payload.accounts_excluded_from_total ?? 0);
    const caveat =
      excluded > 0
        ? ` <em>(excludes ${excluded} account${excluded === 1 ? "" : "s"} with no statement-backed opening balance for this period — see "—" rows above)</em>`
        : "";
    parts.push(`<p><strong>Total closing</strong> ${moneyCents(payload.total_closing_cents)}${caveat}</p>`);
  }
  if (payload.fee_cents != null) {
    parts.push(
      `<p>${esc(payload.statute)} · ${esc(payload.tier_label)} · fee ${moneyCents(payload.fee_cents)} · quarterly disbursements ${moneyCents(payload.quarterly_disbursements_cents)}</p>`,
    );
  }
  if (payload.document_count != null) {
    parts.push(
      `<p>Documents ${esc(payload.document_count)} · invoices ${esc(payload.invoice_count)} · bills ${esc(payload.bill_count)}</p>`,
    );
  }
  return parts.join("\n");
}

export function buildExhibitsPrintBodyHtml(built: BuiltExhibitsPrint, companyName: string): string {
  const debtor = String(companyName ?? "").trim();
  if (!debtor) {
    throw new Error("form_425c_exhibits_debtor_required");
  }
  const letters: ExhibitLetter[] = ["a", "b", "c", "d", "e", "f"];
  const sections = letters
    .map((letter) => exhibitSection(letter, built.exhibits[letter] ?? {}))
    .join("\n");
  return `
    <h1>Form 425C Exhibits A–F</h1>
    <!-- Exhibit A … Exhibit F -->
    <div class="meta">${esc(debtor)} · ${esc(built.period_start)} → ${esc(built.period_end)} · filing ${esc(built.filing_uuid)}</div>
    ${sections}
  `;
}
