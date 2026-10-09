// Lead 2026-10-02 — "a negative cash reserve presents as a payable to Faro, never a negative asset." At close, a credit
// balance on the Faro Cash Reserve (1235) is reclassed to 2156 Due to Faro on the period end and reversed the next day.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getCashReserveReclass, postCashReserveReclass } from "../../api/factoring-cash-reserve-reclass";
import { Button } from "../../components/Button";
import { DataPanel } from "../../components/layout/DataPanel";
import { EntityLink } from "../../components/shared/EntityLink";
import { formatUsdCents } from "../../lib/money";

export function FaroCashReserveReclassPanel({ companyId, period }: { companyId: string; period: string }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = useQuery({
    queryKey: ["factoring", "cash-reserve-reclass", companyId, period],
    queryFn: () => getCashReserveReclass(companyId, period),
    enabled: Boolean(companyId && period),
  });
  const s = status.data;
  if (!s || !s.register_bound || s.state === "no_deficit") return null;

  return (
    <DataPanel title="Faro Cash Reserve deficit — presented as Due to Faro (DR 1235 / CR 2156)">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#1F2A44]" data-testid="faro-cash-reserve-reclass">
        <span className="tabular-nums">
          1235 balance at {s.period_end}: {s.balance_cents == null ? "—" : formatUsdCents(s.balance_cents)} · deficit {formatUsdCents(s.deficit_cents)} ·{" "}
          {s.state === "reclassed"
            ? "reclassed"
            : s.state === "stale"
              ? `reclass of ${formatUsdCents(s.reclass?.deficit_cents ?? 0)} no longer matches — void its two entries and reclass again`
              : "not reclassed"}
          {s.reclass ? (
            <>
              {" · "}
              <EntityLink kind="journal_entry" id={s.reclass.journal_entry_id} label="Reclass" />
              {" · "}
              <EntityLink kind="journal_entry" id={s.reclass.reversal_journal_entry_id} label="Reversal" />
            </>
          ) : null}
        </span>
        {s.state === "due" ? (
          <Button
            size="sm"
            loading={busy}
            onClick={() => {
              setBusy(true);
              setError(null);
              void postCashReserveReclass(companyId, period)
                .then(async () => {
                  await queryClient.invalidateQueries({ queryKey: ["factoring", "cash-reserve-reclass", companyId, period] });
                  await queryClient.invalidateQueries({ queryKey: ["accounting", "month-close", companyId, period] });
                })
                .catch((err: Error) => setError(err.message))
                .finally(() => setBusy(false));
            }}
          >
            Reclass {formatUsdCents(s.deficit_cents)}
          </Button>
        ) : null}
      </div>
      {error ? <p className="mt-2 text-xs text-red-700" role="alert">{error}</p> : null}
    </DataPanel>
  );
}
