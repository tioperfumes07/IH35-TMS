/**
 * ROUND 443.267 board 6 — Legal Landing (board-faithful).
 * Board: ~/Downloads/10-22-2026-LEAD-MOD-DESIGN-V3-Legal.dc.html
 * Sections (order): KPI strip → Contract pipeline + Matters & deadlines → Quick actions.
 * Engines: legalTemplatesApi · legalContractsApi · legalMattersApi.
 */
import { useMemo, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { legalContractsApi, type LegalContractSummary } from "../../../api/legal-contracts";
import { legalMattersApi, type LegalMatterRow } from "../../../api/legal-matters";
import { legalTemplatesApi } from "../../../api/legal-templates";
import { EntityLink } from "../../../components/shared/EntityLink";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { V3KpiTile } from "../../../components/v3/V3KpiTile";
import { BoardSection } from "../../../components/v3/BoardSection";
import { V3, V3_TABLE } from "../../../design/v3-tokens";
import { formatDateUS } from "../../../lib/formatDate";
import { properEnumOrFilterLabel } from "../../../lib/properDisplayText";
import { userFacingApiError } from "../../../lib/api-error-message";
import { formatUsdCents } from "../../../utils/qboFormat";

const thStyle: CSSProperties = {
  textAlign: "left",
  fontSize: V3_TABLE.headerPx,
  fontWeight: 600,
  color: V3.muted,
  padding: `${V3_TABLE.rowPadY}px 12px`,
  borderBottom: `1px solid ${V3.border}`,
  background: V3.headerBg,
  whiteSpace: "nowrap",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const tdStyle: CSSProperties = {
  fontSize: V3_TABLE.fontPx,
  color: V3.ink,
  padding: `${V3_TABLE.rowPadY}px 12px`,
  borderBottom: `1px solid ${V3.borderSoft}`,
  verticalAlign: "middle",
};

const MS_DAY = 24 * 60 * 60 * 1000;

function daysUntil(iso: unknown): number | null {
  if (iso == null || iso === "") return null;
  const t = new Date(String(iso)).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.ceil((t - Date.now()) / MS_DAY);
}

function oldestIso(dates: Array<string | null | undefined>): string | null {
  let best: number | null = null;
  let bestIso: string | null = null;
  for (const d of dates) {
    if (!d) continue;
    const t = new Date(d).getTime();
    if (!Number.isFinite(t)) continue;
    if (best == null || t < best) {
      best = t;
      bestIso = d;
    }
  }
  return bestIso;
}

function matterLabel(m: LegalMatterRow): string {
  const num = String(m.matter_number ?? "").trim();
  if (num) return num;
  const id = String(m.id ?? "");
  return id ? id.slice(0, 8) : "Matter";
}

function nextMatterDate(m: LegalMatterRow): string | null {
  const sol = m.statute_of_limitations_at;
  const hearing = m.next_hearing_date;
  if (sol && hearing) {
    return new Date(String(sol)).getTime() <= new Date(String(hearing)).getTime()
      ? String(sol)
      : String(hearing);
  }
  if (sol) return String(sol);
  if (hearing) return String(hearing);
  return null;
}

function claimedVsReserve(m: LegalMatterRow): string {
  // Engine: amount_claimed_against_us = dollars (numeric); financial_reserve_cents = cents.
  const claimed = m.amount_claimed_against_us;
  const reserve = m.financial_reserve_cents;
  if (claimed == null && reserve == null) return "—";
  const claimedDisplay =
    claimed == null || claimed === ""
      ? "—"
      : typeof claimed === "number"
        ? `$${Number(claimed).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : `$${Number(claimed).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const reserveStr =
    reserve == null || reserve === "" ? "—" : formatUsdCents(Number(reserve));
  return `${claimedDisplay} vs ${reserveStr}`;
}

type PipelineRow = {
  stage: string;
  count: number;
  oldest: string | null;
  href: string;
};

export function LegalHomeBoard({ companyId }: { companyId: string }) {
  const navigate = useNavigate();

  const templatesQuery = useQuery({
    queryKey: ["legal", "home-board", "templates", companyId],
    enabled: Boolean(companyId),
    queryFn: () => legalTemplatesApi.list({ operating_company_id: companyId }).then((r) => r.templates),
  });

  const contractsQuery = useQuery({
    queryKey: ["legal", "home-board", "contracts", companyId],
    enabled: Boolean(companyId),
    queryFn: () => legalContractsApi.list({ operating_company_id: companyId }).then((r) => r.contracts),
  });

  const mattersQuery = useQuery({
    queryKey: ["legal", "home-board", "matters-open", companyId],
    enabled: Boolean(companyId),
    queryFn: () => legalMattersApi.list(companyId, { status: "open", limit: 200 }).then((r) => r.matters),
  });

  const templates = templatesQuery.data ?? [];
  const contracts = contractsQuery.data ?? [];
  const openMatters = mattersQuery.data ?? [];

  const metrics = useMemo(() => {
    const now = Date.now();
    const recentSignedThreshold = now - 30 * MS_DAY;
    const expiringSoonThreshold = now + 60 * MS_DAY;
    const expiringContracts = contracts.filter((row) => {
      if (!row.sent_at) return false;
      if (row.status === "signed_electronically" || row.status === "voided") return false;
      const sentAt = new Date(row.sent_at).getTime();
      if (!Number.isFinite(sentAt)) return false;
      const modeledExpiry = sentAt + 30 * MS_DAY;
      return modeledExpiry <= expiringSoonThreshold;
    }).length;

    return {
      activeTemplates: templates.filter((row) => row.status === "active").length,
      pendingSignatures: contracts.filter((row) => row.status === "sent" || row.status === "viewed").length,
      recentlySigned: contracts.filter(
        (row) => row.signed_at && new Date(row.signed_at).getTime() >= recentSignedThreshold
      ).length,
      expiringContracts,
      openMatters: openMatters.length,
    };
  }, [contracts, templates, openMatters]);

  const pipeline: PipelineRow[] = useMemo(() => {
    const byStatus = (pred: (c: LegalContractSummary) => boolean) => contracts.filter(pred);
    const drafts = byStatus((c) => c.status === "draft");
    const out = byStatus((c) => c.status === "sent" || c.status === "viewed");
    const signed = byStatus((c) => c.status === "signed_electronically");
    const voided = byStatus((c) => c.status === "voided");
    // Board stage "Attorney review" — contracts have no attorney status; templates pending_review is the engine.
    const attorney = templates.filter((t) => t.status === "pending_review");

    return [
      {
        stage: "Draft",
        count: drafts.length,
        oldest: oldestIso(drafts.map((c) => c.created_at)),
        href: "/legal/contracts",
      },
      {
        stage: "Attorney review",
        count: attorney.length,
        oldest: oldestIso(attorney.map((t) => t.updated_at ?? t.created_at)),
        href: "/legal/attorney-review",
      },
      {
        stage: "Out for signature",
        count: out.length,
        oldest: oldestIso(out.map((c) => c.sent_at ?? c.created_at)),
        href: "/legal/contracts",
      },
      {
        stage: "Signed",
        count: signed.length,
        oldest: oldestIso(signed.map((c) => c.signed_at ?? c.created_at)),
        href: "/legal/contracts",
      },
      {
        stage: "Voided",
        count: voided.length,
        oldest: oldestIso(voided.map((c) => c.voided_at ?? c.created_at)),
        href: "/legal/contracts",
      },
    ];
  }, [contracts, templates]);

  const matterRows = useMemo(() => {
    return [...openMatters]
      .map((m) => {
        const next = nextMatterDate(m);
        const d = daysUntil(next);
        return { m, next, atRisk: d !== null && d >= 0 && d < 14 };
      })
      .sort((a, b) => {
        if (!a.next && !b.next) return 0;
        if (!a.next) return 1;
        if (!b.next) return -1;
        return new Date(a.next).getTime() - new Date(b.next).getTime();
      })
      .slice(0, 8);
  }, [openMatters]);

  const loading = templatesQuery.isLoading || contractsQuery.isLoading || mattersQuery.isLoading;
  const errored = templatesQuery.isError || contractsQuery.isError || mattersQuery.isError;
  const errorMsg = templatesQuery.isError
    ? userFacingApiError(templatesQuery.error, "Failed to load legal templates.")
    : contractsQuery.isError
      ? userFacingApiError(contractsQuery.error, "Failed to load legal contracts.")
      : mattersQuery.isError
        ? userFacingApiError(mattersQuery.error, "Failed to load legal matters.")
        : null;

  const dash = (v: number | null | undefined) =>
    v == null || (typeof v === "number" && !Number.isFinite(v)) ? "—" : String(v);

  return (
    <div className="min-w-0 space-y-3" data-testid="legal-home-board" data-legal-home-board="1">
      {errored ? (
        <ListErrorBanner
          message={errorMsg ?? "Failed to load legal dashboard."}
          onRetry={() => {
            void templatesQuery.refetch();
            void contractsQuery.refetch();
            void mattersQuery.refetch();
          }}
        />
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 8,
        }}
        data-testid="legal-home-kpi-strip"
      >
        <V3KpiTile
          testId="legal-kpi-active-templates"
          label="Active templates"
          value={loading && !templatesQuery.isSuccess ? "…" : dash(metrics.activeTemplates)}
          onClick={() => navigate("/legal/templates")}
        />
        <V3KpiTile
          testId="legal-kpi-pending-signatures"
          label="Pending signatures"
          value={loading && !contractsQuery.isSuccess ? "…" : dash(metrics.pendingSignatures)}
          onClick={() => navigate("/legal/contracts")}
        />
        <V3KpiTile
          testId="legal-kpi-recently-signed"
          label="Recently signed (30d)"
          value={loading && !contractsQuery.isSuccess ? "…" : dash(metrics.recentlySigned)}
          onClick={() => navigate("/legal/contracts")}
        />
        <V3KpiTile
          testId="legal-kpi-expiring-contracts"
          label="Expiring contracts (60d)"
          value={loading && !contractsQuery.isSuccess ? "…" : dash(metrics.expiringContracts)}
          onClick={() => navigate("/legal/contracts")}
        />
        <V3KpiTile
          testId="legal-kpi-open-matters"
          label="Open matters"
          value={loading && !mattersQuery.isSuccess ? "…" : dash(metrics.openMatters)}
          onClick={() => navigate("/legal/matters")}
        />
      </div>

      {/* Board: grid 1fr 1fr 220px — Contract pipeline | Matters & deadlines | Quick actions */}
      <div
        className="grid grid-cols-1 items-start gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_220px]"
        data-testid="legal-home-main-grid"
      >
        <BoardSection
          title="Contract pipeline"
          onViewAll={() => navigate("/legal/contracts")}
          testId="legal-home-contract-pipeline"
        >
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: V3.font }}>
              <thead>
                <tr>
                  <th style={thStyle}>Stage</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Contracts</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Oldest</th>
                </tr>
              </thead>
              <tbody>
                {pipeline.map((row) => (
                  <tr
                    key={row.stage}
                    style={{ cursor: "pointer" }}
                    onClick={() => navigate(row.href)}
                    data-testid={`legal-pipeline-${row.stage.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <td style={tdStyle}>{row.stage}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }} className="tabular-nums">
                      {loading && !contractsQuery.isSuccess && !templatesQuery.isSuccess ? "…" : row.count}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right" }} className="tabular-nums">
                      {row.oldest ? formatDateUS(row.oldest) || "—" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </BoardSection>

        <BoardSection
          title="Matters & deadlines"
          onViewAll={() => navigate("/legal/matters")}
          testId="legal-home-matters-deadlines"
        >
          {matterRows.length === 0 ? (
            <div style={{ padding: "12px 14px", fontSize: 12, color: V3.muted, fontFamily: V3.font }}>
              {loading
                ? "Loading matters…"
                : "No open matters. When one is opened it shows here with: type · our role · court · next hearing · statute date · claimed vs reserve, linked to driver, unit, load, accident and insurance claim."}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: V3.font }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Matter</th>
                    <th style={thStyle}>Next date</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>At risk</th>
                  </tr>
                </thead>
                <tbody>
                  {matterRows.map(({ m, next, atRisk }) => {
                    const id = String(m.id ?? "");
                    const type = properEnumOrFilterLabel(String(m.type ?? ""));
                    const role = m.our_role ? properEnumOrFilterLabel(String(m.our_role)) : "—";
                    const court = String(m.court ?? "").trim() || "—";
                    return (
                      <tr key={id || matterLabel(m)}>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 600 }}>
                            {id ? (
                              <EntityLink kind="matter" id={id} label={matterLabel(m)} />
                            ) : (
                              matterLabel(m)
                            )}
                          </div>
                          <div style={{ fontSize: 10, color: V3.muted, marginTop: 2 }}>
                            {type} · {role} · {court}
                            {" · "}
                            {claimedVsReserve(m)}
                          </div>
                        </td>
                        <td style={tdStyle} className="tabular-nums">
                          {next ? formatDateUS(next) || "—" : "—"}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>{atRisk ? "Yes" : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </BoardSection>

        <BoardSection
          title="Quick actions"
          onViewAll={() => navigate("/legal/contracts")}
          testId="legal-home-quick-actions"
        >
          <div style={{ padding: "4px 14px 12px", fontFamily: V3.font }}>
            {(
              [
                ["Send contract →", "/legal/contracts?openSend=1"],
                ["Open template library →", "/legal/templates"],
                ["Review queue →", "/legal/attorney-review"],
                ["Open a matter →", "/legal/matters/new"],
              ] as const
            ).map(([label, to]) => (
              <button
                key={label}
                type="button"
                onClick={() => navigate(to)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 0",
                  border: "none",
                  borderBottom: `1px solid ${V3.borderSoft}`,
                  background: "transparent",
                  fontSize: 12,
                  fontWeight: 600,
                  color: V3.link ?? "#1D4ED8",
                  cursor: "pointer",
                  fontFamily: V3.font,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </BoardSection>
      </div>
    </div>
  );
}
