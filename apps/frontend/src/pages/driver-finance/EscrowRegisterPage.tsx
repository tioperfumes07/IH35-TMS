/**
 * ROUND 443.254 N5 — Driver Escrow Register (V3-Settlements-EscrowRegister).
 * Dated lines · source settlement/JE · running balance. Not the driver profile.
 *
 * ROUND 443.250 — V3 KPI strip (Driver / Held / Target / Release) via V3KpiTile.
 * Engine unchanged: getEscrowDriverBalances + getEscrowDriverTimeline.
 */
import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom"; // Link: register source → settlement/JE
import { useQuery } from "@tanstack/react-query";
import { getEscrowDriverBalances, getEscrowDriverTimeline } from "../../api/banking";
import { getDriverEscrowTarget } from "../../api/driverFinance";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ListErrorState } from "../../components/ListErrorState";
import { formatDisplayName } from "../../components/v3/formatDisplayName";
import { V3KpiTile } from "../../components/v3/V3KpiTile";
import { formatUsdCents, formatUsdTable } from "../../lib/money";
import { formatDateUS } from "../../lib/formatDate";
import { addDaysIso } from "../../lib/businessDate";
import { SettlementsModuleShell } from "./SettlementsModuleShell";
import { V3 } from "../../design/v3-tokens";

/** Owner board Settlements-EscrowRegister.dc.html — policy chrome, not a new engine. */
const ESCROW_RELEASE_WINDOW_DAYS = 60;

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
  const navigate = useNavigate();
  const { driverId = "" } = useParams<{ driverId: string }>();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const releaseEscrowHref = `/accounting/escrow?holder_id=${encodeURIComponent(driverId)}`;

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
  const heldCents = Math.round(held * 100);
  const heldDisplay = balQ.isError ? "—" : formatUsdTable(held);

  const targetQ = useQuery({
    queryKey: ["escrow-register-target", companyId, driverId, heldCents],
    queryFn: () => getDriverEscrowTarget(driverId, companyId, heldCents),
    enabled: Boolean(companyId && driverId && !balQ.isError),
  });

  const lastSettlementAt = useMemo(() => {
    const timeline = tlQ.data?.timeline ?? [];
    let max = "";
    for (const t of timeline) {
      if (!t.settlement_id) continue;
      const at = String(t.created_at ?? "");
      if (at && at.localeCompare(max) > 0) max = at;
    }
    return max || null;
  }, [tlQ.data?.timeline]);

  const releaseEligibleDate = useMemo(() => {
    if (!lastSettlementAt) return null;
    const isoDay = lastSettlementAt.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDay)) return null;
    return addDaysIso(isoDay, ESCROW_RELEASE_WINDOW_DAYS);
  }, [lastSettlementAt]);

  const targetDisplay = useMemo(() => {
    if (targetQ.isError || balQ.isError) return "—";
    if (targetQ.isPending) return "—";
    const cents = targetQ.data?.escrow_target_cents;
    if (cents == null) return "—";
    return formatUsdCents(cents);
  }, [targetQ.isError, targetQ.isPending, targetQ.data?.escrow_target_cents, balQ.isError]);

  const releaseDisplay = useMemo(() => {
    if (tlQ.isError || balQ.isError) return "—";
    if (!releaseEligibleDate) return "—";
    return formatDateUS(releaseEligibleDate) || "—";
  }, [tlQ.isError, balQ.isError, releaseEligibleDate]);

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
      // A uuid fragment is never a label (verify-no-uuid-label-rendering): the source names its kind + date; the link
      // (sourceHref) still opens the exact settlement / journal entry.
      // ROW 215: when load_id is present (per-load expansion), show Load {number} · {date}; fall back to Settlement.
      const settLabel = t.load_id
        ? `Load ${t.load_number ?? "—"} · ${formatDateUS(t.load_date ?? t.created_at) || "posted"}`
        : t.settlement_id
          ? `Settlement · ${formatDateUS(t.created_at) || "posted"}`
          : t.journal_entry_id
            ? `Journal · ${formatDateUS(t.journal_entry_date) || formatDateUS(t.created_at) || "entry"}`
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
      <div
        className="space-y-3 px-1"
        data-testid="escrow-register-page"
        data-settlements-escrow-register-rebuild="1"
      >
        <PageHeader
          title="Driver Settlements"
          subtitle="List + detail settlement workflow"
          breadcrumb={["Driver Finance", "Escrow", driverName]}
          actions={
            <Button
              size="sm"
              data-testid="settlements-escrow-register-creator"
              onClick={() => navigate("/driver-finance/settlements?creator=1")}
            >
              + Settlement Creator
            </Button>
          }
        />

        <div className="flex items-center gap-2 flex-wrap text-xs">
          <Link to="/driver-finance/escrow" className="font-semibold" style={{ color: V3.link }}>
            ← Escrow
          </Link>
          <span className="flex-1" />
          <Button size="sm" variant="secondary" type="button">
            Filters ▾
          </Button>
          <Button size="sm" variant="secondary" type="button" data-testid="escrow-register-export">
            Export
          </Button>
          <Button
            size="sm"
            type="button"
            data-testid="escrow-register-release"
            onClick={() => navigate(releaseEscrowHref)}
          >
            Release escrow
          </Button>
        </div>

        {/* ROUND 443.282 — Target from getDriverEscrowTarget; Release = last settlement + window. */}
        <div
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8 }}
          data-testid="escrow-register-kpi-strip"
          data-escrow-register-v3-kpis="1"
        >
          <V3KpiTile
            label="Driver"
            value={balQ.isError ? "—" : driverName}
            sub="active bond"
            testId="escrow-register-kpi-driver"
          />
          <V3KpiTile
            label="Held"
            value={heldDisplay}
            sub="current escrow balance"
            testId="escrow-register-kpi-held"
          />
          <V3KpiTile
            label="Target"
            value={targetDisplay}
            sub="per pay-rate template"
            testId="escrow-register-kpi-target"
          />
          <V3KpiTile
            label="Release"
            value={releaseDisplay}
            sub={`${ESCROW_RELEASE_WINDOW_DAYS} days after last settlement`}
            testId="escrow-register-kpi-release"
          />
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
            toolbar={
              <Link to="/accounting/escrow" className="font-semibold text-xs" style={{ color: V3.link }}>
                View all →
              </Link>
            }
          />
        )}
        <p className="text-xs" style={{ color: V3.muted }}>
          Each line opens its settlement or journal entry.
        </p>
      </div>
    </SettlementsModuleShell>
  );
}
