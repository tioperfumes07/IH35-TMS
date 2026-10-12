// TABLE_DATE_OMIT: this table has no date column by design — one row per candidate duplicate PAIR of parties (match score, the two records, the merge action); a pair has no date of its own.
import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { useAuth } from "../../auth/useAuth";
import { formatUsdCentsTable } from "../../lib/money";
import { userFacingApiError } from "../../lib/api-error-message";
import { SelectCombobox } from "../Combobox";
import { ParityTable } from "../parity/ParityTable";

/**
 * ROUND 297 — possible duplicates the name-equality engine cannot see (variants: "S E Mares ..." / "Semares ...",
 * acronyms, truncations, spelling across modules). Every pair shows BOTH records' documents, totals and open balance
 * so the owner sees what a merge moves. Propose only: the Owner approves each merge here (Save), the engine re-checks
 * the money to the cent and refuses any change; a cross-module pair (customer ~ Faro debtor / vendor) is named, never
 * merged.
 */
type PartyKind = "customer" | "vendor" | "factoring_debtor";
type Party = { kind: PartyKind; id: string; name: string; docs: number; total_cents: number; open_cents: number };
type Pair = { a: Party; b: Party; score: number; reasons: string[]; mergeable: boolean };

const KIND_LABEL: Record<PartyKind, string> = { customer: "Customer", vendor: "Vendor", factoring_debtor: "Faro debtor" };
const REASON_LABEL: Record<string, string> = {
  same_squashed_name: "same name, other spelling",
  token_set: "same words",
  token_prefix: "shortened word",
  acronym: "acronym",
  concatenated: "joined / truncated",
  phonetic: "sounds alike",
};
const DOC_NOUN: Record<PartyKind, string> = { customer: "invoices", vendor: "bills", factoring_debtor: "Faro lines" };

const pairKey = (p: Pair) => `${p.a.kind}:${p.a.id}~${p.b.kind}:${p.b.id}`;

export function variantPairsFor(pairs: Pair[], board: "customers" | "vendors"): Pair[] {
  const kind: PartyKind = board === "customers" ? "customer" : "vendor";
  return pairs.filter((p) => p.a.kind === kind || p.b.kind === kind);
}

export function useVariantCandidates(operatingCompanyId: string) {
  return useQuery({
    queryKey: ["variant-candidates", operatingCompanyId],
    queryFn: () => apiRequest<{ parties: number; pairs: Pair[] }>(`/api/v1/mdata/canonical/variant-candidates?operating_company_id=${operatingCompanyId}`),
    staleTime: 60_000,
  });
}

function PartyCell({ p }: { p: Party }) {
  return (
    <div>
      <div className="pb-strong">{p.name}</div>
      <div className="pb-sub-sm">
        {KIND_LABEL[p.kind]} · {p.docs ? `${p.docs} ${DOC_NOUN[p.kind]}` : `no ${DOC_NOUN[p.kind]}`} · {formatUsdCentsTable(p.total_cents)}
        {p.kind !== "factoring_debtor" ? <> · open {formatUsdCentsTable(p.open_cents)}</> : null}
      </div>
    </div>
  );
}

export function VariantDuplicatesPanel(props: { board: "customers" | "vendors"; operatingCompanyId: string }) {
  const { user } = useAuth();
  const isOwner = user?.role === "Owner";
  const qc = useQueryClient();
  const q = useVariantCandidates(props.operatingCompanyId);
  const [open, setOpen] = useState<string | null>(null);
  const [survivor, setSurvivor] = useState<"a" | "b">("a");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const merge = useMutation({
    mutationFn: (p: Pair) => {
      const s = survivor === "a" ? p.a : p.b;
      const d = survivor === "a" ? p.b : p.a;
      return apiRequest(`/api/v1/mdata/canonical/${props.board}/merge`, {
        method: "POST",
        body: { operating_company_id: props.operatingCompanyId, survivor_id: s.id, duplicate_id: d.id, reason, evidence: "owner_approved_variant" },
      });
    },
    onSuccess: () => {
      setOpen(null);
      setReason("");
      setError(null);
      void qc.invalidateQueries({ queryKey: ["variant-candidates", props.operatingCompanyId] });
      void qc.invalidateQueries({ queryKey: ["party-board"] });
    },
    onError: (e) => setError(userFacingApiError(e, "The merge was refused.")),
  });

  if (q.isLoading) return <div className="pb-muted">Finding possible duplicates…</div>;
  if (q.isError) return <div className="pb-muted">Could not load possible duplicates. <button type="button" className="pb-link" onClick={() => void q.refetch()}>Retry</button></div>;
  const pairs = variantPairsFor(q.data?.pairs ?? [], props.board);
  if (!pairs.length) return <div className="pb-muted" data-testid="variant-duplicates-empty">No possible duplicates — every {props.board === "customers" ? "customer" : "vendor"} name is distinct across customers, vendors and Faro debtors.</div>;

  return (
    <div className="pb-card" data-testid="variant-duplicates-panel">
      <ParityTable<Pair>
        appearance="board"
        storageKey={`variant-duplicates-${props.board}`}
        tableTestId="variant-duplicates-table"
        rows={pairs}
        rowKey={pairKey}
        rowTestId={() => "variant-duplicate-row"}
        suppressToolbarSearch
        suppressToolbarRange
        hidePager
        initialPageSize={300}
        columns={[
          {
            key: "score", label: "Match", sortValue: (p) => p.score,
            render: (p) => (
              <>
                <div className="pb-strong">{Math.round(p.score * 100)}%</div>
                <div className="pb-sub-sm">{p.reasons.map((r) => REASON_LABEL[r] ?? r).join(" · ")}</div>
              </>
            ),
          },
          { key: "a", label: "Record", sortValue: (p) => p.a.name, render: (p) => <PartyCell p={p.a} /> },
          { key: "b", label: "Possible same party", sortValue: (p) => p.b.name, render: (p) => <PartyCell p={p.b} /> },
          {
            key: "action", label: "Action", sortable: false, overflowVisible: true, allowWrap: true,
            render: (p) => {
              const key = pairKey(p);
              const editing = open === key;
              const s = survivor === "a" ? p.a : p.b;
              const d = survivor === "a" ? p.b : p.a;
              return (
                <>
                {!p.mergeable ? (
                  <span className="pb-muted2" title="Different modules: linked, never merged">Same party in two modules — link, not a merge</span>
                ) : !isOwner ? (
                  <span className="pb-muted2">Owner approves merges</span>
                ) : !editing ? (
                  <button type="button" className="pb-chip" onClick={() => { setOpen(key); setSurvivor(p.a.docs >= p.b.docs ? "a" : "b"); setReason(""); setError(null); }}>
                    Review merge
                  </button>
                ) : (
                  <div data-testid="variant-merge-confirm" style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 260 }}>
                    <label className="pb-sub-sm">
                      Keep{" "}
                      <SelectCombobox className="pb-select" value={survivor} onChange={(e) => setSurvivor(e.target.value as "a" | "b")}>
                        <option value="a">{p.a.name}</option>
                        <option value="b">{p.b.name}</option>
                      </SelectCombobox>
                    </label>
                    <div className="pb-sub-sm">
                      {d.docs} {DOC_NOUN[d.kind]} ({formatUsdCentsTable(d.total_cents)}) move to {s.name}; {d.name} is removed (reversible). Totals are re-checked to the cent.
                    </div>
                    <input className="pb-search" style={{ minWidth: 0 }} placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Merge reason" />
                    {error ? <div className="pb-sub-sm" style={{ color: "var(--ih-red)" }}>{error}</div> : null}
                    <div style={{ display: "flex", gap: 6 }}>
                      <button type="button" className="pb-create" disabled={reason.trim().length < 5 || merge.isPending} onClick={() => merge.mutate(p)}>
                        {merge.isPending ? "Merging…" : "Save"}
                      </button>
                      <button type="button" className="pb-refresh" onClick={() => { setOpen(null); setError(null); }}>Close</button>
                    </div>
                  </div>
                )}
                </>
              );
            },
          },
        ]}
      />
    </div>
  );
}
