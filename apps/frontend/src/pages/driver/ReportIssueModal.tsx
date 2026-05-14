import { useState } from "react";
import { useTranslation } from "react-i18next";
import { submitDriverReport } from "../../api/driver";

type Props = {
  open: boolean;
  loadId?: string | null;
  onClose: () => void;
  onSubmitted?: () => void;
};

function readFileAsBase64(file: File): Promise<{ content_base64: string; content_type: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") return reject(new Error("read_failed"));
      const base64 = result.split(",")[1] ?? "";
      resolve({ content_base64: base64, content_type: file.type || "application/octet-stream" });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function ReportIssueModal({ open, loadId, onClose, onSubmitted }: Props) {
  const { t } = useTranslation();
  const [reportType, setReportType] = useState<"damage" | "maintenance" | "accident" | "other">("damage");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [voice, setVoice] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const photoParts = [];
      for (const file of photos.slice(0, 8)) {
        photoParts.push(await readFileAsBase64(file));
      }
      let voiceMemo: { content_base64: string; content_type: string } | null = null;
      if (voice) voiceMemo = await readFileAsBase64(voice);

      let latitude: number | null = null;
      let longitude: number | null = null;
      if (navigator.geolocation) {
        const pos = await new Promise<GeolocationPosition | null>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (p) => resolve(p),
            () => resolve(null),
            { maximumAge: 60_000, timeout: 8_000 }
          );
        });
        if (pos) {
          latitude = pos.coords.latitude;
          longitude = pos.coords.longitude;
        }
      }

      await submitDriverReport({
        report_type: reportType,
        description: description.trim(),
        load_id: loadId ?? null,
        latitude,
        longitude,
        photos: photoParts,
        voice_memo: voiceMemo,
      });
      onSubmitted?.();
      onClose();
      setDescription("");
      setPhotos([]);
      setVoice(null);
    } catch (err) {
      setError((err as Error).message ?? "submit_failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-lg border border-gray-200 bg-white p-4 shadow-lg sm:rounded-lg">
        <h3 className="mb-2 text-base font-semibold">{t("driver.report_modal_title")}</h3>
        <label className="block text-xs text-gray-600">{t("driver.report_type")}</label>
        <select
          className="mb-2 mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
          value={reportType}
          onChange={(e) => setReportType(e.target.value as typeof reportType)}
        >
          <option value="damage">damage</option>
          <option value="maintenance">maintenance</option>
          <option value="accident">accident</option>
          <option value="other">other</option>
        </select>
        <label className="block text-xs text-gray-600">{t("driver.report_desc")}</label>
        <textarea
          className="mb-2 mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <label className="block text-xs text-gray-600">{t("driver.report_pick_photos")}</label>
        <input
          type="file"
          accept="image/*"
          multiple
          className="mb-2 mt-1 w-full text-xs"
          onChange={(e) => setPhotos(Array.from(e.target.files ?? []))}
        />
        <label className="block text-xs text-gray-600">{t("driver.report_voice")}</label>
        <input type="file" accept="audio/*" className="mb-3 mt-1 w-full text-xs" onChange={(e) => setVoice(e.target.files?.[0] ?? null)} />
        {error ? <p className="mb-2 text-xs text-red-600">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" className="rounded border border-gray-300 px-3 py-1.5 text-sm" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            onClick={() => void submit()}
            disabled={busy || description.trim().length < 3}
          >
            {t("driver.report_submit")}
          </button>
        </div>
      </div>
    </div>
  );
}
