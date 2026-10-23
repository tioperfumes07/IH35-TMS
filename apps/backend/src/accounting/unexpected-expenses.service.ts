/**
 * ROUND 443.267 — Accounting › Unexpected expenses.
 *
 * Board: ~/Downloads/10-22-2026-LEAD-MOD-DESIGN-V3-Accounting-Unexpected.dc.html
 *
 * Candidates = USMCA pending bank DEBIT lines whose payee/description matches the shop /
 * tire / tow / fine / lumper / medical catalog. Not categorized, not matched. A person
 * confirms each line in Banking. No mock rows.
 *
 * Duplicate flag (board): same payee + same amount within 3 calendar days (incl. same day).
 * Distinct from Banking For-review same-day identity `possible_duplicate`.
 */

import { withCurrentUser } from "../auth/db.js";
import { pendingCategorizationPredicate } from "../banking/pending-categorization.js";
import {
  loadPayeeParties,
  parseBankDescription,
  resolveDescribedPayee,
} from "../banking/bank-description-payee.js";
import { companyBusinessDate } from "../lib/company-business-date.js";

export type UnexpectedKind =
  | "shop"
  | "tires"
  | "towing"
  | "fines"
  | "lumper"
  | "medical";

export type UnexpectedKindBucket =
  | "Repairs · shop"
  | "Tires"
  | "Towing · road service"
  | "Fines · citations · scales"
  | "Lumper · detention"
  | "Driver medical · hotel";

export const KIND_BUCKETS: readonly { kind: UnexpectedKind; label: UnexpectedKindBucket }[] = [
  { kind: "shop", label: "Repairs · shop" },
  { kind: "tires", label: "Tires" },
  { kind: "towing", label: "Towing · road service" },
  { kind: "fines", label: "Fines · citations · scales" },
  { kind: "lumper", label: "Lumper · detention" },
  { kind: "medical", label: "Driver medical · hotel" },
] as const;

const KIND_ROW_LABEL: Record<UnexpectedKind, string> = {
  shop: "Shop",
  tires: "Tires",
  towing: "Tow",
  fines: "Fine",
  lumper: "Lumper",
  medical: "Medical",
};

/** Fuel / wash noise that must never land on Unexpected (board + live Neon proof). */
const EXCLUDE_RE =
  /\b(relay\s+fuel|love'?s|loves\s+travel|truck\s*wash|mateo|pilot\s+travel|ta\s+travel|petro\s+stopping|circle\s+k|shell\s+oil|exxon|chevron|valero|murphy\s+usa|qt\s+|quiktrip|speedway|racetrac|wawa)\b/i;

const KIND_PATTERNS: { kind: UnexpectedKind; re: RegExp }[] = [
  // Order matters — first match wins. Tires before shop so "tire shop" → tires.
  { kind: "tires", re: /\b(tire|tires|tyre|tyres|bandal)\b/i },
  { kind: "towing", re: /\b(tow|towing|tow\s*truck|roadside|wrecker|recovery\s+service)\b/i },
  {
    kind: "fines",
    re: /\b(fine|citation|citations|scale|scales|weigh\s*station|ticket|court\s+cost|dmv|dot\s+fine)\b/i,
  },
  { kind: "lumper", re: /\b(lumper|lumpers|detention|unload(?:ing)?\s+fee)\b/i },
  {
    kind: "medical",
    re: /\b(medical|clinic|urgent\s+care|hospital|hotel|motel|lodging|pharmacy|doctor)\b/i,
  },
  {
    kind: "shop",
    // "TRUCK CE" = bank-truncated "TRUCK CENTERS" (live BofA CHECKCARD lines).
    re: /\b(truck\s+cent(?:er|re)s?|truck\s+ce\b|truck\s+shop|repair\s+shop|fleet\s+service|diesel\s+repair|truck\s+repair|sttc|south\s+tex(?:as)?\s+truck|south\s+tx\s+truck)\b/i,
  },
];

export type UnexpectedCandidate = {
  id: string;
  transaction_date: string; // YYYY-MM-DD
  payee_display: string;
  kind: UnexpectedKind;
  kind_label: string;
  amount_cents: number;
  flag: string | null;
  is_duplicate: boolean;
  vendor_id: string | null;
  vendor_name: string | null;
  unit_id: string | null;
  unit_number: string | null;
  work_order_id: string | null;
  work_order_display_id: string | null;
};

export type UnexpectedByKindRow = {
  kind: UnexpectedKind;
  label: UnexpectedKindBucket;
  amount_cents: number | null; // null → render "—"
  count: number;
};

export type UnexpectedExpensesReport = {
  operating_company_id: string;
  month: string; // YYYY-MM
  month_label: string; // e.g. "October"
  as_of_date: string;
  kpis: {
    month_total_cents: number;
    candidate_count: number;
    month_sub: string;
    duplicate_count: number;
    duplicate_amounts_cents: number[];
    linked_to_truck: number;
    tows_fines_cents: number;
    tows_fines_sub: string;
  };
  candidates: UnexpectedCandidate[];
  by_kind: UnexpectedByKindRow[];
};

type BankRow = {
  id: string;
  transaction_date: string;
  description: string | null;
  merchant_name: string | null;
  amount_cents: number;
  is_credit: boolean;
  categorization_unit_id: string | null;
  unit_number: string | null;
  work_order_id: string | null;
  work_order_display_id: string | null;
};

function monthBounds(asOf: string): { monthStart: string; monthEnd: string; month: string; monthLabel: string } {
  const [y, m] = asOf.split("-").map(Number);
  const month = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
  const monthStart = `${month}-01`;
  const lastDay = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  const monthEnd = `${month}-${String(lastDay).padStart(2, "0")}`;
  const monthLabel = new Date(Date.UTC(y!, m! - 1, 1)).toLocaleString("en-US", {
    month: "long",
    timeZone: "UTC",
  });
  return { monthStart, monthEnd, month, monthLabel };
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const aMs = Date.UTC(ay!, am! - 1, ad!);
  const bMs = Date.UTC(by!, bm! - 1, bd!);
  return Math.abs(Math.round((bMs - aMs) / 86_400_000));
}

function mmDd(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${m}-${d}`;
}

function haystack(description: string | null, merchant: string | null, payeeName: string): string {
  return [description ?? "", merchant ?? "", payeeName].join(" ");
}

/** Pure: classify a bank description into an Unexpected kind, or null if excluded / not in catalog. */
export function classifyUnexpectedKind(
  description: string | null,
  merchantName: string | null,
  payeeName: string
): UnexpectedKind | null {
  const text = haystack(description, merchantName, payeeName);
  if (!text.trim()) return null;
  if (EXCLUDE_RE.test(text)) return null;
  // Relay fuel pattern already excluded above; also skip credit-shaped Relay deposit noise by name.
  if (/^Relay\s+(fuel|deposit)\b/i.test(String(description ?? "").trim())) return null;
  for (const { kind, re } of KIND_PATTERNS) {
    if (re.test(text)) return kind;
  }
  return null;
}

function payeeDisplay(
  parsedName: string,
  pattern: string | null,
  vendorName: string | null,
  description: string | null,
  merchantName: string | null
): string {
  const base = (vendorName || parsedName || merchantName || description || "Unknown").trim();
  if (pattern === "zelle_to" || pattern === "zelle_from") {
    if (/\(zelle\)/i.test(base)) return base;
    return `${base} (Zelle)`;
  }
  return base;
}

function formatUsdPlain(cents: number): string {
  const dollars = cents / 100;
  return dollars.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function getUnexpectedExpensesReport(input: {
  userId: string;
  operating_company_id: string;
  as_of_date?: string;
}): Promise<UnexpectedExpensesReport> {
  const asOf = input.as_of_date ?? companyBusinessDate();
  const { monthStart, monthEnd, month, monthLabel } = monthBounds(asOf);
  // Cap the window at as_of so "so far" never invents future days.
  const effectiveEnd = asOf < monthEnd ? asOf : monthEnd;

  return withCurrentUser(input.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [
      input.operating_company_id,
    ]);

    const parties = await loadPayeeParties(client, input.operating_company_id);

    const res = await client.query<BankRow>(
      `
        SELECT
          bt.id::text AS id,
          bt.transaction_date::text AS transaction_date,
          bt.description,
          bt.merchant_name,
          bt.amount_cents::int AS amount_cents,
          bt.is_credit,
          bt.categorization_unit_id::text AS categorization_unit_id,
          u.unit_number,
          NULL::text AS work_order_id,
          NULL::text AS work_order_display_id
        FROM banking.bank_transactions bt
        LEFT JOIN mdata.units u ON u.id = bt.categorization_unit_id
        WHERE bt.operating_company_id = $1::uuid
          AND bt.is_sample_data IS NOT TRUE
          AND bt.is_credit = false
          AND bt.transaction_date >= $2::date
          AND bt.transaction_date <= $3::date
          AND ${pendingCategorizationPredicate("bt")}
        ORDER BY bt.transaction_date ASC, bt.created_at ASC, bt.id ASC
      `,
      [input.operating_company_id, monthStart, effectiveEnd]
    );

    type Staged = {
      row: BankRow;
      kind: UnexpectedKind;
      payeeKey: string;
      payeeDisplay: string;
      vendorId: string | null;
      vendorName: string | null;
      amountAbs: number;
    };

    const staged: Staged[] = [];
    for (const row of res.rows) {
      const parsed = parseBankDescription(row.description, row.merchant_name);
      const resolved = parsed
        ? resolveDescribedPayee(parsed, false, parties)
        : null;
      const payeeName = resolved?.party_name ?? parsed?.name ?? row.merchant_name ?? "";
      const kind = classifyUnexpectedKind(row.description, row.merchant_name, payeeName);
      if (!kind) continue;
      const display = payeeDisplay(
        parsed?.name ?? "",
        parsed?.pattern ?? null,
        resolved?.party_name ?? null,
        row.description,
        row.merchant_name
      );
      const payeeKey = display
        .toLowerCase()
        .replace(/\(zelle\)/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
      staged.push({
        row,
        kind,
        payeeKey,
        payeeDisplay: display,
        vendorId: resolved?.vendor_id ?? null,
        vendorName: resolved?.party_name ?? null,
        amountAbs: Math.abs(Number(row.amount_cents)),
      });
    }

    // Duplicate: later line sharing payeeKey + amountAbs with an earlier line within 3 days.
    const flags = new Map<string, string>();
    for (let i = 0; i < staged.length; i++) {
      const cur = staged[i]!;
      for (let j = 0; j < i; j++) {
        const prev = staged[j]!;
        if (prev.payeeKey !== cur.payeeKey) continue;
        if (prev.amountAbs !== cur.amountAbs) continue;
        const gap = daysBetween(prev.row.transaction_date, cur.row.transaction_date);
        if (gap > 3) continue;
        if (gap === 0) {
          flags.set(cur.row.id, "possible duplicate (same day)");
        } else {
          flags.set(cur.row.id, `possible duplicate of ${mmDd(prev.row.transaction_date)}`);
        }
        break;
      }
    }

    const candidates: UnexpectedCandidate[] = staged.map((s) => ({
      id: s.row.id,
      transaction_date: s.row.transaction_date,
      payee_display: s.payeeDisplay,
      kind: s.kind,
      kind_label: KIND_ROW_LABEL[s.kind],
      amount_cents: s.amountAbs,
      flag: flags.get(s.row.id) ?? null,
      is_duplicate: flags.has(s.row.id),
      vendor_id: s.vendorId,
      vendor_name: s.vendorName,
      unit_id: s.row.categorization_unit_id,
      unit_number: s.row.unit_number,
      work_order_id: s.row.work_order_id,
      work_order_display_id: s.row.work_order_display_id,
    }));

    const monthTotal = candidates.reduce((sum, c) => sum + c.amount_cents, 0);
    const dupes = candidates.filter((c) => c.is_duplicate);
    const linked = candidates.filter((c) => c.unit_id).length;
    const towsFines = candidates
      .filter((c) => c.kind === "towing" || c.kind === "fines")
      .reduce((sum, c) => sum + c.amount_cents, 0);

    const byKind: UnexpectedByKindRow[] = KIND_BUCKETS.map(({ kind, label }) => {
      const rows = candidates.filter((c) => c.kind === kind);
      const amount = rows.reduce((s, c) => s + c.amount_cents, 0);
      return {
        kind,
        label,
        amount_cents: rows.length === 0 ? null : amount,
        count: rows.length,
      };
    });

    const shopTireCount = candidates.filter((c) => c.kind === "shop" || c.kind === "tires").length;

    return {
      operating_company_id: input.operating_company_id,
      month,
      month_label: monthLabel,
      as_of_date: asOf,
      kpis: {
        month_total_cents: monthTotal,
        candidate_count: candidates.length,
        month_sub: `${shopTireCount} shop / tire bank lines`,
        duplicate_count: dupes.length,
        duplicate_amounts_cents: dupes.map((d) => d.amount_cents),
        linked_to_truck: linked,
        tows_fines_cents: towsFines,
        tows_fines_sub: towsFines === 0 ? `none in ${monthLabel}` : `${formatUsdPlain(towsFines)} this month`,
      },
      candidates,
      by_kind: byKind,
    };
  });
}
