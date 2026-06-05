import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  ackDropoffMyTransfer,
  ackPickupMyTransfer,
  listMyOutboundTransfers,
  listMyPendingTransfers,
} from "../api/transfers";

export function EquipmentTransferAckPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const inbound = useQuery({ queryKey: ["driver-pwa", "pending-transfers"], queryFn: listMyPendingTransfers });
  const outbound = useQuery({ queryKey: ["driver-pwa", "outbound-transfers"], queryFn: listMyOutboundTransfers });
  const ackDropoff = useMutation({
    mutationFn: ackDropoffMyTransfer,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["driver-pwa"] }),
  });
  const ackPickup = useMutation({
    mutationFn: ackPickupMyTransfer,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["driver-pwa"] }),
  });

  return (
    <div className="space-y-4 p-4" data-testid="equipment-transfer-ack-page">
      <Link to="/today" className="text-sm text-pwa-accent">
        {t("transfer_ack.back")}
      </Link>
      <h1 className="text-lg font-semibold">{t("transfer_ack.title")}</h1>
      {(outbound.data?.rows ?? []).map((row) => (
        <button key={row.id} type="button" className="block w-full rounded border p-3 text-left" onClick={() => ackDropoff.mutate(row.id)}>
          {t("transfer_ack.ack_dropoff", { id: row.id.slice(0, 8) })}
        </button>
      ))}
      {(inbound.data?.rows ?? []).map((row) => (
        <button
          key={row.id}
          type="button"
          className="block w-full rounded border p-3 text-left"
          disabled={!row.dual_ack?.dropoff_ack_at}
          onClick={() => ackPickup.mutate(row.id)}
        >
          {t("transfer_ack.ack_pickup", { id: row.id.slice(0, 8) })}
        </button>
      ))}
    </div>
  );
}
