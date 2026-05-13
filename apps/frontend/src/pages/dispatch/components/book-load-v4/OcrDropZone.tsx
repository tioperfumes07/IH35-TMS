import { useCallback, useRef, useState } from "react";
import { apiRequestFormData } from "../../../../api/client";

type Props = {
  operatingCompanyId: string;
  onUploaded: (r2Key: string) => void;
};

export function OcrDropZone({ operatingCompanyId, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [phase, setPhase] = useState<"idle" | "uploading" | "done" | "error">("idle");

  const upload = useCallback(
    async (file: File) => {
      setPhase("uploading");
      const fd = new FormData();
      fd.set("operating_company_id", operatingCompanyId);
      fd.set("file", file);
      try {
        const res = await apiRequestFormData<{ ocr_source_pdf_r2_key: string }>("/api/v1/dispatch/loads/ocr-upload", fd);
        onUploaded(res.ocr_source_pdf_r2_key);
        setPhase("done");
      } catch {
        setPhase("error");
      }
    },
    [onUploaded, operatingCompanyId]
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files?.[0];
        if (f) void upload(f);
      }}
      onClick={() => inputRef.current?.click()}
      className={`cursor-pointer rounded border border-dashed border-amber-400 px-3 py-4 text-center text-[11px] ${
        phase === "uploading" ? "bg-amber-100" : "bg-amber-50/60 hover:bg-amber-100/80"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />
      {phase === "idle" ? <span>Drop rate confirmation PDF here, or click to browse</span> : null}
      {phase === "uploading" ? <span>PDF uploading…</span> : null}
      {phase === "done" ? <span>Uploaded — OCR parsing in cycle 4</span> : null}
      {phase === "error" ? <span className="text-red-700">Upload failed — try again or skip</span> : null}
    </div>
  );
}
