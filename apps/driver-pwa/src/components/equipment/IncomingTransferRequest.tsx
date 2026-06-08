import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

type TransferRow = {
  uuid: string;
  status: string;
  transfer_location: string;
  equipment_kind: string;
};

type Props = {
  operatingCompanyId: string;
  driverUuid: string;
  apiBase?: string;
  fetchJson: (path: string, init?: RequestInit) => Promise<unknown>;
};

export function IncomingTransferRequest({ operatingCompanyId, driverUuid, fetchJson }: Props) {
  const [evidenceUuid, setEvidenceUuid] = useState("");
  const [busy, setBusy] = useState(false);

  /** PWA pending queries: direction: "outbound" | direction: "inbound" */
  const pendingQuery = (direction: "outbound" | "inbound") =>
    `/api/v1/dispatch/equipment-transfers/pending?operating_company_id=${operatingCompanyId}&driver=${driverUuid}&direction=${direction}`;

  const outbound = useQuery({
    queryKey: ["pwa", "transfer", "outbound", driverUuid],
    queryFn: () => fetchJson(pendingQuery("outbound")) as Promise<{ data: TransferRow[] }>,
  });

  const inbound = useQuery({
    queryKey: ["pwa", "transfer", "inbound", driverUuid],
    queryFn: () => fetchJson(pendingQuery("inbound")) as Promise<{ data: TransferRow[] }>,
  });

  const pendingOutbound = outbound.data?.data?.[0];
  const pendingInbound = inbound.data?.data?.[0];
  const active = pendingOutbound ?? pendingInbound;
  const mode = pendingOutbound ? "outbound" : pendingInbound ? "inbound" : null;

  async function confirm() {
    if (!active || !mode || !evidenceUuid) return;
    setBusy(true);
    try {
      const path =
        mode === "outbound"
          ? `/api/v1/dispatch/equipment-transfers/${active.uuid}/confirm-outbound`
          : `/api/v1/dispatch/equipment-transfers/${active.uuid}/confirm-inbound`;
      await fetchJson(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operating_company_id: operatingCompanyId,
          driver_uuid: driverUuid,
          evidence_uuid: evidenceUuid,
        }),
      });
      setEvidenceUuid("");
      await outbound.refetch();
      await inbound.refetch();
    } finally {
      setBusy(false);
    }
  }

  if (!active || !mode) return null;

  return (
    <div className="rounded border border-amber-300 bg-amber-50 p-3" data-testid="incoming-transfer-request">
      <div className="font-semibold">
        {mode === "outbound" ? "Confirm equipment drop-off" : "Confirm equipment pickup"}
      </div>
      <div className="text-sm">
        {active.equipment_kind} @ {active.transfer_location} · {active.status}
      </div>
      <input
        className="mt-2 w-full rounded border px-2 py-1 text-sm"
        placeholder="Photo evidence UUID"
        value={evidenceUuid}
        onChange={(e) => setEvidenceUuid(e.target.value)}
      />
      <button type="button" className="mt-2 rounded bg-blue-700 px-3 py-1 text-sm text-white disabled:opacity-50" disabled={busy || !evidenceUuid} onClick={confirm}>
        Confirm with photo
      </button>
    </div>
  );
}

export default IncomingTransferRequest;
