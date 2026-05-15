import { useCallback, useRef, useState, type SyntheticEvent } from "react";
import ReactCrop, { type Crop, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { driverApiRequestFormData } from "../../api/driver-client";
import { ActionButton } from "../../components/shared/ActionButton";
import { useToast } from "../../components/Toast";

export function FuelReceiptPage() {
  const { pushToast } = useToast();
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<Crop>(() => ({
    unit: "%",
    width: 90,
    height: 90,
    x: 5,
    y: 5,
  }));
  const [rotate, setRotate] = useState(0);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [busy, setBusy] = useState(false);

  const onSelectFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImgSrc(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  };

  const onImageLoad = useCallback((e: SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    setCrop(centerCrop(makeAspectCrop({ unit: "%", width: 90 }, 4 / 3, width, height), width, height));
  }, []);

  const submit = async () => {
    const img = imgRef.current;
    if (!img || crop.width == null || crop.height == null) {
      pushToast("Capture or select a photo first", "error");
      return;
    }
    setBusy(true);
    try {
      const sw = (Number(crop.width) / 100) * img.naturalWidth;
      const sh = (Number(crop.height) / 100) * img.naturalHeight;
      const sx = (Number(crop.x) / 100) * img.naturalWidth;
      const sy = (Number(crop.y) / 100) * img.naturalHeight;
      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no_ctx");
      ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
      ctx.translate(sw / 2, sh / 2);
      ctx.rotate((rotate * Math.PI) / 180);
      ctx.drawImage(img, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh);
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.9));
      if (!blob) throw new Error("no_blob");
      const fd = new FormData();
      fd.append("receipt", new File([blob], "receipt.jpg", { type: "image/jpeg" }));
      await driverApiRequestFormData<{ ok: true }>("/api/v1/driver/fuel/upload-receipt", fd);
      pushToast("Receipt uploaded", "success");
      setImgSrc(null);
    } catch {
      pushToast("Upload failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 text-sm">
      <h2 className="text-base font-semibold">Fuel receipt</h2>
      <input type="file" accept="image/*" capture="environment" onChange={(e) => onSelectFile(e.target.files?.[0] ?? null)} />
      {imgSrc ? (
        <div className="space-y-2">
          <ReactCrop crop={crop} onChange={(c) => setCrop(c)}>
            <img ref={imgRef} src={imgSrc} alt="Receipt" onLoad={onImageLoad} className="max-h-80 w-full object-contain" />
          </ReactCrop>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => setRotate((r) => r - 90)}>
              Rotate −
            </button>
            <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => setRotate((r) => r + 90)}>
              Rotate +
            </button>
          </div>
          <label className="block text-xs">
            Brightness {brightness}%
            <input type="range" min={60} max={140} value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} className="w-full" />
          </label>
          <label className="block text-xs">
            Contrast {contrast}%
            <input type="range" min={60} max={140} value={contrast} onChange={(e) => setContrast(Number(e.target.value))} className="w-full" />
          </label>
          <div className="flex gap-2">
            <ActionButton onClick={() => void submit()} disabled={busy}>
              Upload
            </ActionButton>
            <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => setImgSrc(null)}>
              Retake
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
