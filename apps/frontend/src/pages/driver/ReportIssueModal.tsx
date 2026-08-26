import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { submitDriverReport } from "../../api/driver";
import { Modal } from "../../components/Modal";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";

type Props = {
  open: boolean;
  loadId?: string | null;
  /** Optional human load display id for EntityLink label (server-generated). */
  loadDisplayId?: string | null;
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

export function ReportIssueModal({ open, loadId, loadDisplayId, onClose, onSubmitted }: Props) {
  const { t } = useTranslation();
  const [reportType, setReportType] = useState<"damage" | "maintenance" | "accident" | "other">("damage");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [voice, setVoice] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetDraft = useCallback(() => {
    setReportType("damage");
    setDescription("");
    setPhotos([]);
    setVoice(null);
    setError(null);
  }, []);

  useEffect(() => {
    if (open) resetDraft();
  }, [open, loadId, resetDraft]);

  const handleClose = useCallback(() => {
    resetDraft();
    onClose();
  }, [onClose, resetDraft]);

  const modalTitle = t("driver.report_modal_title");

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
      handleClose();
    } catch (err) {
      setError((err as Error).message ?? "submit_failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title={modalTitle}>
      <div className="space-y-3 text-sm" data-testid="driver-report-issue-modal">
        {loadId ? (
          <p className="text-xs text-slate-600" data-testid="driver-report-issue-load-link">
            Load:{" "}
            <EntityLink
              kind="load"
              id={loadId}
              label={entityLabel(loadDisplayId, loadId, "Load")}
              data-testid="driver-report-issue-load-entity-link"
            />
          </p>
        ) : (
          <p className="text-xs text-slate-500" data-testid="driver-report-issue-load-absent">
            No load linked — report will save without a load FK.
          </p>
        )}
        <label className="block text-xs text-gray-600">{t("driver.report_type")}</label>
        <SelectCombobox
          className="mb-1 w-full rounded-sm border border-gray-300 px-2 py-1 text-sm"
          value={reportType}
          onChange={(e) => setReportType(e.target.value as typeof reportType)}
        >
          <option value="damage">damage</option>
          <option value="maintenance">maintenance</option>
          <option value="accident">accident</option>
          <option value="other">other</option>
        </SelectCombobox>
        <label className="block text-xs text-gray-600">{t("driver.report_desc")}</label>
        <textarea
          className="w-full rounded-sm border border-gray-300 px-2 py-1 text-sm"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          data-testid="driver-report-issue-description"
        />
        <label className="block text-xs text-gray-600">{t("driver.report_pick_photos")}</label>
        <input
          type="file"
          accept="image/*"
          multiple
          className="w-full text-xs"
          onChange={(e) => setPhotos(Array.from(e.target.files ?? []))}
        />
        <label className="block text-xs text-gray-600">{t("driver.report_voice")}</label>
        <input
          type="file"
          accept="audio/*"
          className="w-full text-xs"
          onChange={(e) => setVoice(e.target.files?.[0] ?? null)}
        />
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            className="rounded-sm border border-gray-300 px-3 py-1.5 text-sm"
            onClick={handleClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-sm bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            onClick={() => void submit()}
            disabled={busy || description.trim().length < 3}
            data-testid="driver-report-issue-submit"
          >
            {t("driver.report_submit")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
