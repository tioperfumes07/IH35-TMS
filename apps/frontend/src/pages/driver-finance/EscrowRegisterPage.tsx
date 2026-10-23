/**
 * ROUND 443.254 N5 — Driver Escrow Register (V3-Settlements-EscrowRegister).
 * Dated lines · source settlement/JE · running balance. Not the driver profile.
 */
import type React from "react";
import { useMemo } from "react";
import { Link, useParams } from "react-router-dom"; // Link: register source → settlement/JE
import { useQuery } from "@tanstack/react-query";
import { getEscrowDriverBalances, getEscrowDriverTimeline } from "../../api/banking";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ListErrorState } from "../../components/ListErrorState";
import { formatDisplayName } from "../../components/v3/formatDisplayName";
import { formatUsdTable } from "../../lib/money";
import { formatDateUS } from "../../lib/formatDate";
import { SettlementsModuleShell } from "./SettlementsModuleShell";
import { V3 } from "../../design/v3-tokens";
import { EntityLink } from "../../components/shared/EntityLink";

type RegisterRow = {
  id: string;
  date: string;
  source: string;
  sourceHref: string | null;
  type: string;
  inAmt: number | null;
  outAmt: number | null;
  balance: number;
};

function labelType(raw: string | null): string {
  const t = String(raw ?? "").toLowerCase();
  if (t === "deposit") return "Deduction";
  if (t === "release") return "Release";
  if (t === "adjustment") return "Adjustment";
  if (t === "forfeiture") return "Forfeiture";
  if (t === "opening" || t.includes("open")) return "Opening";
  if (!t) return "—";
  return t.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function EscrowRegisterPage() {
  const { driverId = "" } = useParams<{ driverId: string }>();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const balQ = useQuery({
    queryKey: ["escrow-register-bal", companyId, driverId],
    queryFn: () => getEscrowDriverBalances(companyId),
    enabled: Boolean(companyId && driverId),
  });
  const tlQ = useQuery({
    queryKey: ["escrow-register-tl", companyId, driverId],
    queryFn: () => getEscrowDriverTimeline(companyId, driverId),
    enabled: Boolean(companyId && driverId),
  });

  const driver = (balQ.data?.drivers ?? []).find((d) => d.driver_id === driverId);
  const driverName = formatDisplayName(driver?.driver_name ?? "Driver");
  const held = Number(driver?.escrow_balance ?? 0);

  const rows: RegisterRow[] = useMemo(() => {
    const timeline = [...(tlQ.data?.timeline ?? [])].sort((a, b) =>
      String(a.created_at).localeCompare(String(b.created_at)),
    );
    let run = 0;
    const built: RegisterRow[] = [];
    for (const t of timeline) {
      const amt = Number(t.amount ?? 0);
      const typ = String(t.entry_type ?? "").toLowerCase();
      const isOut = typ === "release" || typ === "forfeiture" || amt < 0;
      const abs = Math.abs(amt);
      run += isOut ? -abs : abs;
      const settLabel = t.settlement_id
        ? `Settlement ${t.settlement_id.slice(0, 8)}`
        : t.journal_entry_id
          ? `Journal ${formatDateUS(t.journal_entry_date) || t.journal_entry_id.slice(0, 8)}`
          : t.memo || "Escrow entry";
      built.push({
        id: t.id,
        date: t.created_at,
        source: settLabel,
        sourceHref: t.settlement_id
          ? `/driver-finance/settlements?settlement_id=${encodeURIComponent(t.settlement_id)}`
          : t.journal_entry_id
            ? `/accounting/journal-entries/${encodeURIComponent(t.journal_entry_id)}`
            : null,
        type: labelType(t.entry_type),
        inAmt: isOut ? null : abs,
        outAmt: isOut ? abs : null,
        balance: run,
      });
    }
    return built.reverse();
  }, [tlQ.data?.timeline]);

  const columns = useMemo<ParityColumn<RegisterRow>[]>(
    () => [
      {
        key: "date",
        label: "Date",
        sortable: true,
        sortValue: (r) => r.date,
        render: (r) => formatDateUS(r.date) || "—",
      },
      {
        key: "source",
        label: "Source",
        sortable: true,
        sortValue: (r) => r.source,
        render: (r) =>
          r.sourceHref ? (
            <Link to={r.sourceHref} className="underline" style={{ color: V3.link }}>
              {r.source}
            </Link>
          ) : (
            r.source
          ),
      },
      { key: "type", label: "Type", sortable: true },
      {
        key: "inAmt",
        label: "In",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums",
        sortValue: (r) => r.inAmt ?? 0,
        render: (r) => (r.inAmt == null ? "" : formatUsdTable(r.inAmt).replace(/^\$/, "")),
      },
      {
        key: "outAmt",
        label: "Out",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums",
        sortValue: (r) => r.outAmt ?? 0,
        render: (r) => (r.outAmt == null ? "" : formatUsdTable(r.outAmt).replace(/^\$/, "")),
      },
      {
        key: "balance",
        label: "Balance",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums",
        sortValue: (r) => r.balance,
        render: (r) => formatUsdTable(r.balance).replace(/^\$/, ""),
      },
    ],
    [],
  );

  return (
    <SettlementsModuleShell showBack backLabel="Escrow" backTo="/driver-finance/escrow">
      <div className="space-y-3 px-1" data-testid="escrow-register-page">
        <div className="grid gap-2 md:grid-cols-4">
          <Kpi label="Driver" value={driverId ? <EntityLink kind="driver" id={driverId} label={driverName} /> : driverName} sub="active bond" />
          <Kpi label="Held" value={formatUsdTable(held)} />
          <Kpi label="Target" value="—" sub="per pay-rate template" />
          <Kpi label="Release" value="—" sub="60 days after last settlement" />
        </div>
        {tlQ.isError ? (
          <ListErrorState
            title="Couldn't load escrow register"
            status={0}
            message={(tlQ.error as Error)?.message}
            onRetry={() => void tlQ.refetch()}
          />
        ) : (
          <ParityTable<RegisterRow>
            title={`Escrow register — ${driverName}`}
            columns={columns}
            rows={rows}
            rowKey={(r) => r.id}
            loading={tlQ.isLoading || balQ.isLoading}
            emptyText="No escrow lines for this driver."
            storageKey={`settlements-escrow-register-${driverId}`}
            serverViewKey={`settlements-escrow-register-${driverId}`}
            tableTestId="escrow-register-table"
            gearButtonTestId="escrow-register-column-gear"
          />
        )}
        <p className="text-xs" style={{ color: V3.muted }}>
          Each line opens its settlement or journal entry.
        </p>
      </div>
    </SettlementsModuleShell>
  );
}

function Kpi({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div
      className="flex flex-col gap-1 rounded-sm border px-3 py-2"
      style={{ background: V3.surface, borderColor: V3.border }}
    >
      <span className="text-section-header font-semibold uppercase tracking-wide" style={{ color: V3.muted }}>
        {label}
      </span>
      <span className="text-xs font-bold tabular-nums" style={{ color: V3.ink }}>
        {value}
      </span>
      {sub ? (
        <span className="text-xs" style={{ color: V3.muted }}>
          {sub}
        </span>
      ) : null}
    </div>
  );
}
