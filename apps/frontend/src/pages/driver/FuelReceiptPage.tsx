import { useCallback, useRef, useState } from "react";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { resolveApiUrl } from "../../api/client";
import { getValidDriverAccessToken } from "../../lib/auth-token";
import { driverFetch } from "../../lib/driver-offline-queue";

export function FuelReceiptPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);
  const [truckId, setTruckId] = useState("");
  const [odometer, setOdometer] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [station, setStation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
  }, [stream]);

  const startCamera = async () => {
    setMessage(null);
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      setStream(media);
      if (videoRef.current) {
        videoRef.current.srcObject = media;
        await videoRef.current.play();
      }
    } catch {
      setMessage("Camera permission denied or unavailable.");
    }
  };

  const captureToCanvas = () => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c || !v.videoWidth) return;
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.save();
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(v, -c.width / 2, -c.height / 2, c.width, c.height);
    ctx.restore();
    setPreviewUrl(c.toDataURL("image/jpeg", 0.82));
    stopCamera();
  };

  const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
    const res = await fetch(dataUrl);
    return res.blob();
  };

  const submit = async () => {
    setMessage(null);
    if (!truckId || !odometer || amount == null || !station) {
      setMessage("Fill truck, odometer, amount, and station.");
      return;
    }
    let blob: Blob;
    if (previewUrl) blob = await dataUrlToBlob(previewUrl);
    else {
      setMessage("Capture or choose a photo first.");
      return;
    }
    const token = await getValidDriverAccessToken();
    if (!token) {
      setMessage("Not signed in.");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("truck_id", truckId);
      fd.set("odometer", odometer);
      fd.set("amount", String(amount)); // backend z.coerce.number() → Math.round(amount*100); byte-for-byte
      fd.set("station_name", station);
      fd.set("image", blob, "receipt.jpg");
      const res = await driverFetch(resolveApiUrl("/api/v1/driver/fuel/upload-receipt"), {
        method: "POST",
        headers: { "x-driver-token": token },
        body: fd,
      });
      const json = (await res.json().catch(() => ({}))) as { bank_transaction_id?: string; queued?: boolean; error?: string };
      if (res.status === 202 && json.queued) setMessage("Queued offline — will upload when connected.");
      else if (res.ok) setMessage(`Saved. Bank txn ${json.bank_transaction_id ?? ""}`);
      else setMessage(json.error ?? "Upload failed");
    } catch {
      setMessage("Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 text-sm">
      <h1 className="text-base font-semibold">Fuel receipt</h1>
      {message ? <p className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs">{message}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded border px-2 py-1" onClick={() => void startCamera()}>
          Use camera
        </button>
        <button type="button" className="rounded border px-2 py-1" onClick={() => stopCamera()}>
          Stop camera
        </button>
        <label className="rounded border px-2 py-1">
          Choose file
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setPreviewUrl(URL.createObjectURL(f));
            }}
          />
        </label>
        <button type="button" className="rounded border px-2 py-1" onClick={() => setRotation((r) => (r + 90) % 360)}>
          Rotate 90°
        </button>
        <button type="button" className="rounded border px-2 py-1" onClick={captureToCanvas} disabled={!stream}>
          Capture
        </button>
      </div>

      <video ref={videoRef} className={`w-full rounded border ${stream ? "block" : "hidden"}`} playsInline muted />
      <canvas ref={canvasRef} className="hidden" />
      {previewUrl ? <img src={previewUrl} alt="Receipt preview" className="w-full rounded border" /> : null}

      <label className="block text-xs font-medium text-slate-600">
        Truck (unit) ID
        <input className="mt-1 w-full rounded border px-2 py-1" value={truckId} onChange={(e) => setTruckId(e.target.value)} />
      </label>
      <label className="block text-xs font-medium text-slate-600">
        Odometer
        <input className="mt-1 w-full rounded border px-2 py-1" value={odometer} onChange={(e) => setOdometer(e.target.value)} inputMode="numeric" />
      </label>
      <label className="block text-xs font-medium text-slate-600">
        Amount (USD)
        {/* M-1: dollars-mode QBO money entry; backend z.coerce.number()→round(amount*100), byte-for-byte. */}
        <MoneyInput valueDollars={amount} onChangeDollars={setAmount} ariaLabel="Amount (USD)" className="mt-1 w-full" />
      </label>
      <label className="block text-xs font-medium text-slate-600">
        Station name
        <input className="mt-1 w-full rounded border px-2 py-1" value={station} onChange={(e) => setStation(e.target.value)} />
      </label>

      <button
        type="button"
        className="w-full rounded bg-slate-900 py-2 text-white disabled:opacity-50"
        disabled={busy}
        onClick={() => void submit()}
      >
        {busy ? "Uploading…" : "Upload receipt"}
      </button>
    </div>
  );
}
