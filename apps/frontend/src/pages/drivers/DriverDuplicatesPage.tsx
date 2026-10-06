/**
 * DUPLICATE DRIVER PROFILES (owner 2026-10-06): "what we do need to merge are the drivers that have multiple profiles in
 * the app. Only one driver-vendor profile, can have many Samsara usernames and accounts."
 *
 * Each card is one person: the suggested surviving profile and the other profiles that look like the same person (same
 * name, or a CDL one character apart). The owner picks the survivor, previews exactly what the merge does (moved /
 * kept on the survivor / history the database keeps), and merges. Samsara is never written; its users follow the driver.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { ListErrorState } from "../../components/ListErrorState";
import { EntityLink } from "../../components/shared/EntityLink";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { driverMergeApi, type DuplicateCluster, type DuplicateDriver, type MergePreview } from "../../api/driverMerge";

const nameOf = (d: { first_name: string | null; last_name: string | null }) => `${d.first_name ?? ""} ${d.last_name ?? ""}`.trim() || "—";
const STATUS_LABEL: Record<string, string> = {
  moved: "Moves to the surviving profile",
  kept_on_survivor: "Survivor already has its own — the duplicate's copy stays, superseded",
  history_kept: "History the database keeps as recorded (resolves to the survivor)",
};

function ClusterCard({ cluster, companyId }: { cluster: DuplicateCluster; companyId: string }) {
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const members: DuplicateDriver[] = [cluster.survivor, ...cluster.merged];
  const [survivorId, setSurvivorId] = useState(cluster.survivor.id);
  const [previews, setPreviews] = useState<Record<string, MergePreview>>({});
  const [reason, setReason] = useState("");
  const others = members.filter((m) => m.id !== survivorId);

  const preview = useMutation({
    mutationFn: async () => {
      const out: Record<string, MergePreview> = {};
      for (const m of others) out[m.id] = await driverMergeApi.preview(companyId, survivorId, m.id);
      return out;
    },
    onSuccess: setPreviews,
    onError: (e) => pushToast(userFacingApiError(e, "Couldn't preview the merge"), "error"),
  });
  const merge = useMutation({
    mutationFn: async () => {
      for (const m of others) await driverMergeApi.merge(companyId, survivorId, m.id, reason || null);
    },
    onSuccess: () => {
      pushToast(`Merged ${others.length} profile(s) into ${nameOf(members.find((m) => m.id === survivorId)!)}`, "success");
      void qc.invalidateQueries({ queryKey: ["driver-duplicates", companyId] });
    },
    onError: (e) => pushToast(userFacingApiError(e, "The merge was refused — nothing changed"), "error"),
  });
  const previewed = others.length > 0 && others.every((m) => previews[m.id]);
  const blockers = others.flatMap((m) => previews[m.id]?.blockers ?? []);
  const needsReason = others.some((m) => previews[m.id]?.needs_override_reason);

  return (
    <section className="rounded border border-[#E5E7EB] bg-white p-3" data-testid={`dup-cluster-${cluster.survivor.id}`}>
      <div className="mb-2 text-xs text-[#4B5563]">Why these look like one person: {cluster.why.join(" · ")}</div>
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="ih-hd text-center">Keep</th>
            <th className="ih-hd text-left">Profile</th>
            <th className="ih-hd text-center">Status</th>
            <th className="ih-hd text-center">CDL</th>
            <th className="ih-hd text-center">Loads</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id} className="border-t border-[#E5E7EB]">
              <td className="text-center">
                <input
                  type="radio"
                  name={`survivor-${cluster.survivor.id}`}
                  checked={survivorId === m.id}
                  onChange={() => {
                    setSurvivorId(m.id);
                    setPreviews({});
                  }}
                  aria-label={`Keep ${nameOf(m)}`}
                />
              </td>
              <td>
                <EntityLink kind="driver" id={m.id} label={nameOf(m)} />
              </td>
              <td className="text-center">{m.status}</td>
              <td className="text-center">{m.cdl_number ?? "—"}</td>
              <td data-quantity className="text-center tabular-nums">{m.loads}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {previewed ? (
        <div className="mt-2 space-y-2" data-testid="dup-preview">
          {others.map((m) => (
            <div key={m.id} className="rounded border border-[#E5E7EB] p-2">
              <div className="mb-1 text-xs font-semibold">
                {nameOf(m)} → {nameOf(members.find((x) => x.id === survivorId)!)}
              </div>
              {previews[m.id].references.length === 0 ? <div className="text-xs text-[#6B7280]">Nothing references this profile — it simply retires.</div> : null}
              <ul className="text-xs text-[#4B5563]">
                {previews[m.id].references.map((r) => (
                  <li key={r.ref}>
                    <span data-quantity className="tabular-nums">{r.rows}</span> · {r.ref} — {STATUS_LABEL[r.status ?? "moved"] ?? r.status}
                  </li>
                ))}
              </ul>
              {previews[m.id].escrow.merged_balance_cents !== 0 ? (
                <div className="mt-1 text-xs">Escrow on the duplicate moves to the survivor by a journal entry.</div>
              ) : null}
            </div>
          ))}
          {blockers.length ? (
            <div role="alert" className="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-700">
              {blockers.map((b) => (
                <div key={b}>{b}</div>
              ))}
            </div>
          ) : null}
          {needsReason ? (
            <label className="block text-xs">
              The profile you are keeping has fewer loads. Why is this the right one to keep?
              <input className="mt-1 h-[34px] w-full rounded border border-[#E5E7EB] px-2" value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
          ) : null}
        </div>
      ) : null}

      <div className="mt-2 flex justify-end gap-2">
        <Button variant="secondary" size="sm" loading={preview.isPending} onClick={() => preview.mutate()}>
          Preview merge
        </Button>
        <Button
          size="sm"
          disabled={!previewed || blockers.length > 0 || (needsReason && reason.trim().length < 15)}
          loading={merge.isPending}
          onClick={() => merge.mutate()}
          data-testid={`dup-merge-${cluster.survivor.id}`}
        >
          Merge into kept profile
        </Button>
      </div>
    </section>
  );
}

export function DriverDuplicatesPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const q = useQuery({
    queryKey: ["driver-duplicates", companyId],
    queryFn: () => driverMergeApi.candidates(companyId),
    enabled: Boolean(companyId),
  });
  const clusters = q.data?.pairs ?? [];
  return (
    <div className="space-y-3">
      <PageHeader
        breadcrumb={["Drivers", "Duplicate profiles"]}
        title="Duplicate driver profiles"
        subtitle="One driver profile per person — that profile can hold many Samsara users. Merging never changes Samsara."
      />
      {q.isError ? (
        <ListErrorState title="Couldn't load duplicate profiles" status={0} message={(q.error as Error)?.message} onRetry={() => void q.refetch()} />
      ) : q.isLoading ? (
        <div className="text-xs text-[#6B7280]">Finding profiles that look like the same person…</div>
      ) : clusters.length === 0 ? (
        <div className="text-xs text-[#6B7280]">No duplicate driver profiles found.</div>
      ) : (
        <>
          <div className="text-xs text-[#4B5563]" data-testid="dup-summary">
            <span data-quantity className="tabular-nums">{clusters.length}</span> people with{" "}
            <span data-quantity className="tabular-nums">{clusters.reduce((t, c) => t + c.merged.length, 0)}</span> extra profiles.
          </div>
          {clusters.map((c) => (
            <ClusterCard key={c.survivor.id} cluster={c} companyId={companyId} />
          ))}
        </>
      )}
    </div>
  );
}
