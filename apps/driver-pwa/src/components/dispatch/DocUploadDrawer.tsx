import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PwaButton } from "../PwaButton";
import { useToast } from "../Toast";

type DocUploadDrawerProps = {
  open: boolean;
  onClose: () => void;
  onUploaded: (evidenceUuid: string) => void;
  docType: "bol" | "pod" | "lumper_receipt" | "other";
};

function randomEvidenceUuid(): string {
  const hex = "0123456789abcdef";
  const parts = [8, 4, 4, 4, 12];
  return parts
    .map((len, index) => {
      let segment = "";
      for (let i = 0; i < len; i += 1) {
        const pick = index === 2 ? hex[Math.floor(Math.random() * 4) + 8] : hex[Math.floor(Math.random() * 16)];
        segment += pick;
      }
      return segment;
    })
    .join("-");
}

export function DocUploadDrawer({ open, onClose, onUploaded, docType }: DocUploadDrawerProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const { pushToast } = useToast();
  const docTypeLabel = docType.toUpperCase();

  if (!open) return null;

  async function handleFileSelected(file: File | null) {
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setUploading(true);
    try {
      const evidenceUuid = randomEvidenceUuid();
      onUploaded(evidenceUuid);
      pushToast(t("dispatch.upload_queued", { docType: docTypeLabel }), "success");
      onClose();
    } catch {
      pushToast(t("dispatch.upload_failed"), "error");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center overflow-y-auto bg-black/50 p-4" data-testid="dispatch-doc-upload-drawer">
      <div className="my-auto w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-lg border border-pwa-border bg-pwa-card p-4">
        <div className="text-sm font-semibold">{t("dispatch.upload_title", { docType: docTypeLabel })}</div>
        <div className="mt-1 text-xs text-pwa-text-secondary">{t("dispatch.upload_hint")}</div>
        {previewUrl ? (
          <img src={previewUrl} alt={t("doc.damage_photo", { defaultValue: "Document preview" })} className="mt-3 max-h-40 w-full rounded object-cover" />
        ) : null}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="mt-3 w-full text-xs"
          onChange={(event) => void handleFileSelected(event.target.files?.[0] ?? null)}
        />
        <div className="mt-3 flex gap-2">
          <PwaButton variant="secondary" className="flex-1" onClick={onClose}>
            {t("common.cancel")}
          </PwaButton>
          <PwaButton className="flex-1" disabled={uploading} onClick={() => inputRef.current?.click()}>
            {uploading ? t("dispatch.uploading") : t("dispatch.choose_photo")}
          </PwaButton>
        </div>
      </div>
    </div>
  );
}
