import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const [evidenceUuid, setEvidenceUuid] = useState("");
  const [busy, setBusy] = useState(false);

  const pendingQuery = (direction: "outbound" | "inbound") =>
    `/api/v1/dispatch/equipment-transfers/pending?operating_company_id=${operatingCompanyId}&driver=${driverUuid}&direction=${direction}`;

  const outbound = useQuery({
    queryKey: ["pwa", "transfer", "outbound", driverUuid],
    queryFn: () => fetchJson(pendingQuery("outbound")) as Promise<{ requests: TransferRow[] }>,
  });

  const inbound = useQuery({
    queryKey: ["pwa", "transfer", "inbound", driverUuid],
    queryFn: () => fetchJson(pendingQuery("inbound")) as Promise<{ requests: TransferRow[] }>,
  });

  const pendingOutbound = outbound.data?.requests?.[0];
  const pendingInbound = inbound.data?.requests?.[0];
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
        {mode === "outbound" ? t("equipment.confirm_drop_title") : t("equipment.confirm_pickup_title")}
      </div>
      <div className="text-sm">
        {t("equipment.location_status", {
          kind: active.equipment_kind,
          location: active.transfer_location,
          status: active.status,
        })}
      </div>
      <input
        className="mt-2 w-full rounded border px-2 py-1 text-sm"
        placeholder={t("equipment.evidence_placeholder")}
        value={evidenceUuid}
        onChange={(e) => setEvidenceUuid(e.target.value)}
      />
      <button
        type="button"
        className="mt-2 rounded bg-blue-700 px-3 py-1 text-sm text-white disabled:opacity-50"
        disabled={busy || !evidenceUuid}
        onClick={confirm}
      >
        {t("equipment.confirm_with_photo")}
      </button>
    </div>
  );
}

export default IncomingTransferRequest;
