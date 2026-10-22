import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { legalMattersApi } from "../../../api/legal-matters";
import { legalContractsApi } from "../../../api/legal-contracts";
import { ClickableStat } from "../ClickableStat";
import { ModBoardShell, ModSectionHead } from "../ModBoardShell";
import { formatUsdCents } from "../format";

type Props = { companyId: string };

const STAGES = [
  { id: "intake", label: "Intake", match: /intake|new|open/i },
  { id: "demand", label: "Demand letter", match: /demand/i },
  { id: "filed", label: "Filed", match: /filed|complaint/i },
  { id: "discovery", label: "Discovery", match: /discovery/i },
  { id: "hearing", label: "Hearing", match: /hearing|trial/i },
  { id: "closed", label: "Settled / closed", match: /closed|settled|dismissed/i },
] as const;

function stageOf(matter: Record<string, unknown>): (typeof STAGES)[number]["id"] {
  const status = String(matter.status ?? matter.stage ?? matter.matter_status ?? "");
  for (const s of STAGES) {
    if (s.match.test(status)) return s.id;
  }
  const closed = Boolean(matter.closed_at) || /void/i.test(status);
  return closed ? "closed" : "intake";
}

function claimedCents(matter: Record<string, unknown>): number {
  const raw =
    matter.amount_claimed_cents ??
    matter.claimed_cents ??
    matter.claim_amount_cents ??
    matter.exposure_cents;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * ROUND 443.248 — Legal matters board (LEAD-MOD-DESIGN-Legal).
 * Live matters + contracts; empty stages show designed empty copy (no LAYOUT SAMPLE).
 */
export function LegalMattersBoard({ companyId }: Props) {
  const mattersQ = useQuery({
    queryKey: ["mod-graphics", "legal-matters", companyId],
    queryFn: () => legalMattersApi.list(companyId, { limit: 200 }),
    enabled: Boolean(companyId),
    retry: false,
  });
  const contractsQ = useQuery({
    queryKey: ["mod-graphics", "legal-contracts", companyId],
    queryFn: () => legalContractsApi.list({ operating_company_id: companyId }),
    enabled: Boolean(companyId),
    retry: false,
  });
  const deadlinesQ = useQuery({
    queryKey: ["mod-graphics", "legal-deadlines", companyId],
    queryFn: () => legalMattersApi.deadlineAlerts(companyId, 90),
    enabled: Boolean(companyId),
    retry: false,
  });

  const matters = mattersQ.data?.matters ?? [];
  const openMatters = matters.filter((m) => stageOf(m) !== "closed");
  const claimed = openMatters.reduce((s, m) => s + claimedCents(m), 0);
  const byStage = useMemo(() => {
    const map = new Map<string, Record<string, unknown>[]>();
    for (const s of STAGES) map.set(s.id, []);
    for (const m of matters) {
      const id = stageOf(m);
      map.get(id)?.push(m);
    }
    return map;
  }, [matters]);

  const contracts = contractsQ.data?.contracts ?? [];
  const draft = contracts.filter((c) => /draft/i.test(String(c.status))).length;
  const voided = contracts.filter((c) => /void/i.test(String(c.status))).length;
  const signed = contracts.filter((c) => /signed/i.test(String(c.status))).length;
  const deadlineCount =
    (deadlinesQ.data as { alerts?: unknown[]; deadlines?: unknown[] } | undefined)?.alerts?.length ??
    (deadlinesQ.data as { alerts?: unknown[]; deadlines?: unknown[] } | undefined)?.deadlines?.length ??
    0;

  return (
    <ModBoardShell
      eyebrow="Legal · USMCA · live"
      title="Legal matters"
      subtitle="Every matter, every deadline, what it could cost"
      testId="legal-matters-board"
    >
      <div className="mod-board__kpi-grid">
        <ClickableStat
          label="Open matters"
          value={mattersQ.isError ? "—" : String(openMatters.length)}
          hint="real"
          to="/legal/matters"
          testId="legal-board-open"
        />
        <ClickableStat
          label="$ claimed against us"
          value={mattersQ.isError ? "—" : formatUsdCents(claimed)}
          hint="real open matters"
          to="/legal/matters"
          testId="legal-board-claimed"
        />
        <ClickableStat
          label="Deadlines 90 days"
          value={deadlinesQ.isError ? "—" : String(deadlineCount)}
          hint={deadlineCount === 0 ? "no real deadlines yet" : "hearings · answers · statute"}
          to="/legal/matters"
          testId="legal-board-deadlines"
        />
        <ClickableStat
          label="Contracts in draft"
          value={contractsQ.isError ? "—" : String(draft)}
          hint={`${voided} voided · ${signed} signed`}
          to="/legal/contracts"
          testId="legal-board-contracts"
        />
      </div>

      <ModSectionHead title="Matters board — stage columns" viewAllTo="/legal/matters" />
      {mattersQ.isError ? (
        <div className="mod-empty">Legal matters could not be loaded.</div>
      ) : (
        <div className="grid gap-1.5 sm:grid-cols-3 lg:grid-cols-6" data-testid="legal-board-stages">
          {STAGES.map((s) => {
            const rows = byStage.get(s.id) ?? [];
            return (
              <div key={s.id} className="rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] p-1.5">
                <div className="text-[11px] font-bold uppercase text-[#14213D]">{s.label}</div>
                {rows.length === 0 ? (
                  <div className="mt-1 text-[11px] text-[#6B7280]">no real matter</div>
                ) : (
                  <div className="mt-1 space-y-1">
                    {rows.slice(0, 4).map((m) => {
                      const id = String(m.id ?? "");
                      const to = `/legal/matters/${encodeURIComponent(id)}`;
                      const title = String(m.title ?? m.matter_number ?? m.display_id ?? "Matter");
                      return (
                        <Link
                          key={id}
                          to={to}
                          className="block rounded-sm border border-[#E5E7EB] bg-white px-1.5 py-1 text-[11px] text-[#14213D] no-underline"
                          data-mod-click-through="1"
                          data-mod-click-to={to}
                        >
                          <div className="font-semibold">{title}</div>
                          <div className="font-mono text-[#6B7280]">{formatUsdCents(claimedCents(m))}</div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ModSectionHead title="Deadlines — next 90 days" viewAllTo="/legal/matters" />
      {deadlineCount === 0 ? (
        <div className="mod-empty">
          no real deadlines — hearings, answers due and statute dates appear as pins
        </div>
      ) : (
        <div className="mod-empty">{deadlineCount} deadlines in the next 90 days — open Matters.</div>
      )}

      <ModSectionHead title="Contracts pipeline" viewAllTo="/legal/contracts" />
      <div className="flex flex-wrap gap-2 text-[12px]">
        <Link to="/legal/contracts?status=draft" className="rounded-sm border border-[#E5E7EB] px-2 py-1 no-underline" data-mod-click-through="1" data-mod-click-to="/legal/contracts?status=draft">
          Draft · {draft}
        </Link>
        <Link to="/legal/contracts?status=sent" className="rounded-sm border border-[#E5E7EB] px-2 py-1 no-underline" data-mod-click-through="1" data-mod-click-to="/legal/contracts?status=sent">
          Out for signature
        </Link>
        <Link to="/legal/contracts?status=signed" className="rounded-sm border border-[#E5E7EB] px-2 py-1 no-underline" data-mod-click-through="1" data-mod-click-to="/legal/contracts?status=signed">
          Signed · {signed}
        </Link>
        <Link to="/legal/contracts?status=voided" className="rounded-sm border border-[#E5E7EB] px-2 py-1 no-underline" data-mod-click-through="1" data-mod-click-to="/legal/contracts?status=voided">
          Voided · {voided}
        </Link>
      </div>
    </ModBoardShell>
  );
}
