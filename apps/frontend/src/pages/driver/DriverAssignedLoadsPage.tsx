import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import SignaturePad from "signature_pad";
import {
  acceptDriverOffer,
  declineDriverOffer,
  listDriverAssignedLoads,
  postDriverLoadStatus,
  type AssignedLoadRow,
} from "../../api/driver";
import { driverApiRequestFormData } from "../../api/driver-client";
import { ActionButton } from "../../components/shared/ActionButton";
import { useToast } from "../../components/Toast";

function geolocate(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("no_geolocation"));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (e) => reject(e),
      { enableHighAccuracy: true, timeout: 20_000 }
    );
  });
}

export function DriverAssignedLoadsPage() {
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const q = useQuery({ queryKey: ["driver", "loads-assigned"], queryFn: listDriverAssignedLoads });
  const [podFor, setPodFor] = useState<{ load: AssignedLoadRow; kind: "pickup" | "delivery" } | null>(null);

  const acceptMu = useMutation({
    mutationFn: (id: string) => acceptDriverOffer(id),
    onSuccess: async () => {
      pushToast("Load accepted", "success");
      await qc.invalidateQueries({ queryKey: ["driver", "loads-assigned"] });
    },
    onError: () => pushToast("Accept failed", "error"),
  });

  const declineMu = useMutation({
    mutationFn: (id: string) => declineDriverOffer(id),
    onSuccess: async () => {
      pushToast("Declined", "info");
      await qc.invalidateQueries({ queryKey: ["driver", "loads-assigned"] });
    },
    onError: () => pushToast("Decline failed", "error"),
  });

  const statusMu = useMutation({
    mutationFn: async (args: { loadId: string; status: "at_pickup" | "in_transit" | "at_delivery" | "delivered" }) => {
      const geo = await geolocate().catch(() => ({ lat: 0, lng: 0 }));
      return postDriverLoadStatus(args.loadId, {
        status: args.status,
        location: geo,
        timestamp: new Date().toISOString(),
      });
    },
    onSuccess: async () => {
      pushToast("Status updated", "success");
      await qc.invalidateQueries({ queryKey: ["driver", "loads-assigned"] });
    },
    onError: () => pushToast("Status failed", "error"),
  });

  if (q.isLoading) return <p className="text-sm text-gray-600">Loading…</p>;
  if (q.error) return <p className="text-sm text-red-600">Could not load assigned freight.</p>;

  const loads = q.data?.loads ?? [];

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold">Assigned loads</h2>
      <ul className="space-y-2">
        {loads.map((row) => (
          <li key={row.id} className="rounded border border-slate-200 bg-white p-3 text-sm">
            <div className="font-medium">{row.load_number ?? row.id}</div>
            <div className="text-xs text-slate-600">Status: {row.status}</div>
            {row.status === "offered" ? (
              <div className="mt-2 flex gap-2">
                <ActionButton onClick={() => acceptMu.mutate(row.id)} disabled={acceptMu.isPending}>
                  Accept
                </ActionButton>
                <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => declineMu.mutate(row.id)}>
                  Decline
                </button>
              </div>
            ) : (
              <div className="mt-2 flex flex-col gap-1">
                <ActionButton
                  onClick={() => {
                    if (row.status === "booked") statusMu.mutate({ loadId: row.id, status: "at_pickup" });
                    else if (row.status === "at_pickup") statusMu.mutate({ loadId: row.id, status: "in_transit" });
                    else if (row.status === "in_transit") statusMu.mutate({ loadId: row.id, status: "at_delivery" });
                  }}
                  disabled={statusMu.isPending || ["delivered"].includes(row.status)}
                >
                  Update status
                </ActionButton>
                <div className="flex gap-2">
                  <button type="button" className="text-xs text-blue-700 underline" onClick={() => setPodFor({ load: row, kind: "pickup" })}>
                    Pickup POD
                  </button>
                  <button type="button" className="text-xs text-blue-700 underline" onClick={() => setPodFor({ load: row, kind: "delivery" })}>
                    Delivery POD
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {loads.length === 0 ? <p className="text-xs text-slate-500">No offered or booked loads.</p> : null}
      {podFor ? (
        <PodModal
          load={podFor.load}
          kind={podFor.kind}
          onClose={() => setPodFor(null)}
          onDone={async () => {
            await qc.invalidateQueries({ queryKey: ["driver", "loads-assigned"] });
            setPodFor(null);
          }}
        />
      ) : null}
    </div>
  );
}

function PodModal(props: {
  load: AssignedLoadRow;
  kind: "pickup" | "delivery";
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const { pushToast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pad = new SignaturePad(canvas, { backgroundColor: "#ffffff" });
    padRef.current = pad;
    return () => {
      pad.off();
    };
  }, []);

  const submit = useCallback(async () => {
    try {
      const geo = await geolocate();
      const pad = padRef.current;
      if (!photo || !pad || pad.isEmpty()) {
        pushToast("Photo and signature required", "error");
        return;
      }
      const blob = await new Promise<Blob | null>((res) => canvasRef.current?.toBlob(res, "image/png"));
      if (!blob) return;
      const fd = new FormData();
      fd.append("photo", photo);
      fd.append("signature", new File([blob], "signature.png", { type: "image/png" }));
      fd.append("lat", String(geo.lat));
      fd.append("lng", String(geo.lng));
      fd.append("timestamp", new Date().toISOString());
      const path =
        props.kind === "pickup"
          ? `/api/v1/driver/loads/${encodeURIComponent(props.load.id)}/pickup-event`
          : `/api/v1/driver/loads/${encodeURIComponent(props.load.id)}/delivery-event`;
      await driverApiRequestFormData<{ ok: true }>(path, fd);
      pushToast("POD submitted", "success");
      await props.onDone();
    } catch {
      pushToast("POD failed", "error");
    }
  }, [photo, props, pushToast]);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 p-3">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-3 shadow">
        <div className="mb-2 flex justify-between">
          <span className="font-semibold">{props.kind === "pickup" ? "Pickup" : "Delivery"} POD</span>
          <button type="button" className="text-xs" onClick={props.onClose}>
            Close
          </button>
        </div>
        <input type="file" accept="image/*" capture="environment" className="mb-2 w-full text-xs" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
        <div className="mb-1 text-xs">Signature</div>
        <canvas ref={canvasRef} className="w-full rounded border" width={400} height={160} />
        <button type="button" className="mt-2 w-full rounded border py-2 text-sm" onClick={() => void submit()}>
          Confirm arrival / delivery
        </button>
      </div>
    </div>
  );
}
