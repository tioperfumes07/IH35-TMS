import { useEffect, useMemo, useRef, useState } from "react";
import {
  createAttachmentUploadUrl,
  deleteAttachment,
  finalizeAttachment,
  listAttachments,
  parseRateConfirmationFromAttachment,
  type AttachmentCategory,
  type AttachmentEntityType,
  type AttachmentRow,
} from "../api/attachments";
import { Button } from "./Button";
import { SelectCombobox } from "./shared/SelectCombobox";

const CATEGORY_OPTIONS: AttachmentCategory[] = [
  "rate_confirmation",
  "vendor_invoice",
  "check_image",
  "ach_confirmation",
  "wire_confirmation",
  "deposit_slip",
  "vendor_estimate",
  "vendor_ro",
  "receipt",
  "damage_photo",
  "other",
];

async function sha256Hex(file: File) {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function uploadWithProgress(url: string, file: File, onProgress: (pct: number) => void) {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`upload_failed_${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("upload_network_error"));
    xhr.send(file);
  });
}

type UploadZoneProps = {
  operatingCompanyId: string;
  entityType: AttachmentEntityType;
  entityId: string;
  defaultCategory?: AttachmentCategory;
  title?: string;
  onUploaded?: (attachment: AttachmentRow) => void;
  onOcrParsed?: (parsed: {
    confidence_score: number;
    customer_name_raw: string;
    customer_id: string | null;
    origin_city: string;
    origin_state: string;
    destination_city: string;
    destination_state: string;
    pickup_date: string;
    delivery_date: string;
    rate_cents: number;
    load_number_external: string;
    raw_extraction: Record<string, unknown>;
  }) => void;
};

export function UploadZone({
  operatingCompanyId,
  entityType,
  entityId,
  defaultCategory = "other",
  title = "Attachments",
  onUploaded,
  onOcrParsed,
}: UploadZoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<AttachmentRow[]>([]);
  const [categoryByFile, setCategoryByFile] = useState<Record<string, AttachmentCategory>>({});
  const [uploadingByName, setUploadingByName] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  async function refreshList() {
    const result = await listAttachments({
      operating_company_id: operatingCompanyId,
      entity_type: entityType,
      entity_id: entityId,
    });
    setRows(result.rows ?? []);
  }

  useEffect(() => {
    if (!operatingCompanyId || !entityId) return;
    void refreshList();
  }, [operatingCompanyId, entityId, entityType]);

  const currentById = useMemo(() => {
    const map = new Map<string, AttachmentRow>();
    for (const row of rows) map.set(row.id, row);
    return map;
  }, [rows]);

  const pickFiles = () => fileInputRef.current?.click();

  async function onFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    const list = Array.from(files);
    for (const file of list) {
      const localKey = `${file.name}:${file.size}:${file.lastModified}`;
      try {
        setUploadingByName((current) => ({ ...current, [localKey]: 3 }));
        const category = categoryByFile[file.name] ?? defaultCategory;
        const uploadUrl = await createAttachmentUploadUrl({
          operating_company_id: operatingCompanyId,
          entity_type: entityType,
          entity_id: entityId,
          filename: file.name,
          content_type: file.type || "application/octet-stream",
          size_bytes: file.size,
        });
        await uploadWithProgress(uploadUrl.upload_url, file, (pct) => {
          setUploadingByName((current) => ({ ...current, [localKey]: Math.max(3, pct) }));
        });
        const hash = await sha256Hex(file);
        await finalizeAttachment(uploadUrl.attachment_id, {
          operating_company_id: operatingCompanyId,
          sha256_hash: hash,
          category,
        });
        await refreshList();
        const finalized = Array.from(currentById.values()).find((row) => row.filename === file.name);
        if (finalized && onUploaded) onUploaded(finalized);
        if (category === "rate_confirmation" && onOcrParsed) {
          const ocr = await parseRateConfirmationFromAttachment(uploadUrl.attachment_id, operatingCompanyId);
          onOcrParsed(ocr.parsed);
        }
      } catch (uploadError) {
        setError(`Failed to upload ${file.name}: ${String((uploadError as Error).message ?? "unknown_error")}`);
      } finally {
        setUploadingByName((current) => {
          const copy = { ...current };
          delete copy[localKey];
          return copy;
        });
      }
    }
  }

  return (
    <div className="rounded border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">{title}</h3>
        <Button type="button" size="sm" variant="secondary" onClick={pickFiles}>
          Add files
        </Button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          void onFilesSelected(event.target.files);
          event.currentTarget.value = "";
        }}
      />
      <div
        className="rounded border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-xs text-slate-600"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void onFilesSelected(event.dataTransfer.files);
        }}
      >
        Drag and drop files here, or click Add files.
      </div>
      {error ? <div className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">{error}</div> : null}
      {Object.entries(uploadingByName).length > 0 ? (
        <div className="mt-2 space-y-1">
          {Object.entries(uploadingByName).map(([key, pct]) => (
            <div key={key} className="text-xs text-slate-700">
              Uploading {key.split(":")[0]} - {pct}%
            </div>
          ))}
        </div>
      ) : null}
      <div className="mt-2 space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center justify-between rounded border border-slate-200 px-2 py-1">
            <div className="min-w-0">
              <div className="truncate text-xs font-medium text-slate-800">{row.filename}</div>
              <div className="text-[11px] text-slate-500">
                {Math.round(Number(row.size_bytes || 0) / 1024)} KB - {row.content_type}
              </div>
            </div>
            <div className="ml-2 flex items-center gap-2">
              <SelectCombobox
                className="h-8 rounded border border-slate-300 px-2 text-xs"
                value={row.category}
                onChange={(event) => setCategoryByFile((current) => ({ ...current, [row.filename]: event.target.value as AttachmentCategory }))}
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </SelectCombobox>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={async () => {
                  await deleteAttachment(row.id, operatingCompanyId);
                  await refreshList();
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        ))}
        {rows.length === 0 ? <div className="text-xs text-slate-500">No files attached yet.</div> : null}
      </div>
    </div>
  );
}
