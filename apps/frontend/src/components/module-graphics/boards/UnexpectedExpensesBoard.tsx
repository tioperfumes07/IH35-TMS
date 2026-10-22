import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getPlaidCompanyTransactions, type PlaidBankTransaction } from "../../../api/banking";
import { ClickableStat } from "../ClickableStat";
import { ModBoardShell, ModSectionHead } from "../ModBoardShell";
import { formatUsdCents, monthToDateRange } from "../format";

type Props = { companyId: string };

type Kind =
  | "repairs"
  | "tires"
  | "towing"
  | "fines"
  | "lumper"
  | "medical"
  | "other";

const KIND_PATTERNS: Array<{ kind: Kind; re: RegExp; label: string }> = [
  { kind: "tires", re: /\b(tire|tires|bandag|goodyear|bridgestone|michelin)\b/i, label: "Tires" },
  { kind: "towing", re: /\b(tow|towing|road\s*service|roadside|wrecker)\b/i, label: "Towing · road service" },
  { kind: "fines", re: /\b(fine|citation|scale| toll|ticket|court)\b/i, label: "Fines · citations · scales" },
  { kind: "lumper", re: /\b(lumper|detention|unload)\b/i, label: "Lumper · detention" },
  { kind: "medical", re: /\b(medical|clinic|hotel|motel|urgent\s*care)\b/i, label: "Driver medical · hotel" },
  {
    kind: "repairs",
    re: /\b(truck\s*center|repair|shop|diesel|mechanic|fleet\s*service|parts|south\s*texas)\b/i,
    label: "Repairs · shop",
  },
];

function classify(tx: PlaidBankTransaction): Kind | null {
  const hay = `${tx.merchant_name ?? ""} ${tx.description ?? ""}`;
  for (const p of KIND_PATTERNS) {
    if (p.re.test(hay)) return p.kind;
  }
  return null;
}

function absOutCents(tx: PlaidBankTransaction): number {
  // Money out: prefer unsigned magnitude for spend (credits are money in).
  if (tx.is_credit) return 0;
  return Math.abs(tx.amount_cents ?? 0);
}

async function fetchMtdOutflows(companyId: string, from: string, to: string): Promise<PlaidBankTransaction[]> {
  const rows: PlaidBankTransaction[] = [];
  for (let offset = 0; offset < 3000; offset += 200) {
    const page = await getPlaidCompanyTransactions(companyId, {
      date_from: from,
      date_to: to,
      limit: 200,
      offset,
      types: ["money_out"],
      sort: "date_desc",
    });
    const got = page.transactions ?? [];
    rows.push(...got);
    if (got.length < 200) break;
  }
  return rows;
}

/**
 * ROUND 443.248 — Unexpected expenses (LEAD-MOD-DESIGN-Unexpected).
 * Candidates = bank outflows whose payee/description matches shop/tire/tow/fine catalog.
 * Nothing is categorized or matched by this board — display only; link opens Banking.
 */
export function UnexpectedExpensesBoard({ companyId }: Props) {
  const range = useMemo(() => monthToDateRange(), []);

  const txQ = useQuery({
    queryKey: ["mod-graphics", "unexpected", companyId, range.from, range.to],
    queryFn: () => fetchMtdOutflows(companyId, range.from, range.to),
    enabled: Boolean(companyId),
    retry: false,
  });

  const candidates = useMemo(() => {
    const out: Array<PlaidBankTransaction & { kind: Kind }> = [];
    for (const tx of txQ.data ?? []) {
      if (tx.review_bucket === "excluded") continue;
      const kind = classify(tx);
      if (!kind) continue;
      out.push({ ...tx, kind });
    }
    return out.sort((a, b) => b.transaction_date.localeCompare(a.transaction_date));
  }, [txQ.data]);

  const totalCents = candidates.reduce((s, t) => s + absOutCents(t), 0);
  const linked = candidates.filter((t) => t.matched_load_id || t.resolved_load_id).length;
  const byKind = useMemo(() => {
    const m = new Map<Kind, number>();
    for (const t of candidates) m.set(t.kind, (m.get(t.kind) ?? 0) + absOutCents(t));
    return m;
  }, [candidates]);

  const dupes = useMemo(() => {
    const keys = new Map<string, PlaidBankTransaction[]>();
    for (const t of candidates) {
      const payee = (t.merchant_name || t.description || "").trim().toLowerCase();
      const amt = absOutCents(t);
      const key = `${payee}|${amt}`;
      const arr = keys.get(key) ?? [];
      arr.push(t);
      keys.set(key, arr);
    }
    const flagged = new Set<string>();
    const amounts = new Set<number>();
    for (const [, arr] of keys) {
      if (arr.length < 2) continue;
      const dates = arr.map((t) => t.transaction_date).sort();
      for (let i = 1; i < dates.length; i++) {
        const a = new Date(`${dates[i - 1]}T12:00:00`).getTime();
        const b = new Date(`${dates[i]}T12:00:00`).getTime();
        if (Math.abs(b - a) <= 3 * 86400000) {
          for (const t of arr) flagged.add(t.id);
          amounts.add(absOutCents(arr[0]));
        }
      }
    }
    return { ids: flagged, amounts: [...amounts] };
  }, [candidates]);

  const bankList = `/banking/transactions?date_from=${encodeURIComponent(range.from)}&date_to=${encodeURIComponent(range.to)}&types=money_out`;
  const towFineCents = (byKind.get("towing") ?? 0) + (byKind.get("fines") ?? 0);

  return (
    <ModBoardShell
      eyebrow={`Unexpected expenses · USMCA · live ${range.from} – ${range.to}`}
      title="Unexpected expenses"
      subtitle="Surprise costs — repairs, tires, tows, fines"
      testId="unexpected-expenses-board"
    >
      <div className="mod-board__kpi-grid">
        <ClickableStat
          label="Month so far"
          value={txQ.isError ? "—" : formatUsdCents(totalCents)}
          hint={txQ.isError ? "Unable to load" : `${candidates.length} shop / tire / tow bank lines`}
          to={bankList}
          testId="unexp-board-total"
        />
        <ClickableStat
          label="Possible duplicates"
          value={
            txQ.isError
              ? "—"
              : dupes.amounts.length
                ? dupes.amounts.map((c) => formatUsdCents(c)).join(" · ")
                : "None"
          }
          hint="same payee + amount within 3 days"
          to={bankList}
          testId="unexp-board-dupes"
        />
        <ClickableStat
          label="Linked to a truck"
          value={txQ.isError ? "—" : `${linked} of ${candidates.length}`}
          hint="link in Banking"
          to={bankList}
          testId="unexp-board-linked"
        />
        <ClickableStat
          label="Tows · fines"
          value={txQ.isError ? "—" : formatUsdCents(towFineCents)}
          hint={towFineCents === 0 ? "none found this month" : "bank candidates"}
          to={`${bankList}&q=tow`}
          testId="unexp-board-tow-fine"
        />
      </div>

      <ModSectionHead
        title={`${range.from.slice(5)} – ${range.to.slice(5)} — shop & tire payments from the bank (${formatUsdCents(totalCents)})`}
        viewAllTo={bankList}
      />
      {txQ.isError ? (
        <div className="mod-empty">Bank lines could not be loaded.</div>
      ) : txQ.isLoading ? (
        <div className="mod-empty">Loading unexpected expense candidates…</div>
      ) : candidates.length === 0 ? (
        <div className="mod-empty">No shop, tire, tow, or fine bank lines in this window yet.</div>
      ) : (
        <div className="space-y-1" data-testid="unexp-board-list">
          {candidates.slice(0, 12).map((t) => {
            const to = `/banking/transactions?focus=${encodeURIComponent(t.id)}`;
            const isDupe = dupes.ids.has(t.id);
            return (
              <Link
                key={t.id}
                to={to}
                className="flex items-center justify-between gap-2 rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] px-2 py-1.5 no-underline hover:border-[#14213D]"
                data-mod-click-through="1"
                data-mod-click-to={to}
              >
                <div className="min-w-0">
                  <div className="text-section-header font-bold uppercase text-[#6B7280]">
                    {t.transaction_date.slice(5)}
                  </div>
                  <div className="truncate text-xs font-semibold text-[#14213D]">
                    {t.merchant_name || t.description || "Bank line"}
                  </div>
                  {isDupe ? (
                    <div className="text-section-header text-[#C76A0A]">possible duplicate</div>
                  ) : (
                    <div className="text-section-header text-[#2456C7]">Link unit · work order</div>
                  )}
                </div>
                <div className="shrink-0 font-mono text-xs font-semibold text-[#14213D]">
                  {formatUsdCents(absOutCents(t))}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <ModSectionHead title="By kind — this month" viewAllTo={bankList} />
      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3" data-testid="unexp-board-kinds">
        {KIND_PATTERNS.map((p) => {
          const cents = byKind.get(p.kind) ?? 0;
          const to = `${bankList}&q=${encodeURIComponent(p.kind === "repairs" ? "shop" : p.kind)}`;
          return (
            <Link
              key={p.kind}
              to={to}
              className="flex items-center justify-between rounded-sm border border-[#E5E7EB] bg-white px-2 py-1.5 no-underline"
              data-mod-click-through="1"
              data-mod-click-to={to}
            >
              <span className="text-xs text-[#14213D]">{p.label}</span>
              <span className="font-mono text-xs font-semibold text-[#14213D]">{formatUsdCents(cents)}</span>
            </Link>
          );
        })}
      </div>

      <ModSectionHead title="Which truck it hit" viewAllTo={bankList} />
      <div className="mod-empty" data-testid="unexp-board-truck-empty">
        {linked === 0
          ? `${candidates.length ? `0 of ${candidates.length} lines linked to a truck yet.` : "Link a unit from Banking when you categorize."}`
          : `${linked} of ${candidates.length} lines linked — open Banking to finish the rest.`}
      </div>
    </ModBoardShell>
  );
}
