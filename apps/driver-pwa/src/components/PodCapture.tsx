import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { compressImage } from "../lib/image-compress";
import { SignaturePad } from "./SignaturePad";
import { PwaButton } from "./PwaButton";
import { useToast } from "./Toast";

type PodCaptureProps = {
  loadId: string;
  stopId: string;
  onCaptured: () => void;
  onCancel?: () => void;
};

export function PodCapture({ loadId, stopId, onCaptured, onCancel }: PodCaptureProps) {
  const { t } = useTranslation();
  const { pushToast } = useToast();
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [signatureDataUrl, setSignatureDataUrl] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function fileToDataUrl(file: File): Promise<string> {
    const optimized = await compressImage(file, 1920, 0.8);
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("Unable to read photo"));
      reader.readAsDataURL(optimized);
    });
  }

  async function handleSubmit() {
    if (!signatureDataUrl) {
      pushToast(t("pod.signature_required"), "error");
      return;
    }
    setSubmitting(true);
    try {
      const { submitPodCapture } = await import("../api/pod");
      const photo_base64 = photoFile ? await fileToDataUrl(photoFile) : undefined;
      await submitPodCapture(loadId, stopId, {
        photo_base64,
        signature_base64: signatureDataUrl,
        recipient_name: recipientName.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      pushToast(t("pod.submitted"), "success");
      onCaptured();
    } catch (error) {
      pushToast(error instanceof Error ? error.message : t("pod.submit_failed"), "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3" data-testid="pod-capture-panel">
      <p className="text-sm text-pwa-text-secondary">{t("pod.instructions")}</p>

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        data-testid="pod-photo-input"
        onChange={(event) => {
          const picked = event.target.files?.[0] ?? null;
          if (picked) setPhotoFile(picked);
        }}
      />

      <PwaButton className="w-full" onClick={() => cameraInputRef.current?.click()}>
        {photoFile ? t("pod.retake_photo") : t("pod.capture_photo")}
      </PwaButton>
      {photoFile ? (
        <div className="rounded-lg border border-pwa-border bg-[#101522] p-2 text-xs text-pwa-text-secondary" data-testid="pod-photo-preview">
          {photoFile.name}
        </div>
      ) : null}

      <label className="block text-xs font-semibold text-pwa-text-secondary">{t("pod.recipient_name")}</label>
      <input
        type="text"
        value={recipientName}
        onChange={(event) => setRecipientName(event.target.value)}
        className="h-11 w-full rounded-lg border border-pwa-border bg-pwa-card px-3 text-sm text-pwa-text-primary"
        placeholder={t("pod.recipient_placeholder")}
      />

      <label className="block text-xs font-semibold text-pwa-text-secondary">{t("pod.signature")}</label>
      <SignaturePad onChange={setSignatureDataUrl} disabled={submitting} />

      <label className="block text-xs font-semibold text-pwa-text-secondary">{t("pod.notes")}</label>
      <textarea
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        rows={2}
        className="w-full rounded-lg border border-pwa-border bg-pwa-card px-3 py-2 text-sm text-pwa-text-primary"
        placeholder={t("pod.notes_placeholder")}
      />

      <div className="flex gap-2">
        {onCancel ? (
          <PwaButton variant="secondary" className="flex-1" onClick={onCancel} disabled={submitting}>
            {t("common.cancel")}
          </PwaButton>
        ) : null}
        <PwaButton className="flex-1" onClick={() => void handleSubmit()} disabled={submitting || !signatureDataUrl}>
          {submitting ? t("pod.submitting") : t("pod.submit")}
        </PwaButton>
      </div>
    </div>
  );
}

export function isPodCaptureComplete(signatureDataUrl: string, photoFile: File | null, requirePhoto = false): boolean {
  if (!signatureDataUrl) return false;
  if (requirePhoto && !photoFile) return false;
  return true;
}
