import { useMemo, useRef, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { ApiError } from "../../api/client";
import {
  confirmUpload,
  listFileCategories,
  requestUploadUrlFromFile,
  updateFileMetadata,
  uploadNewVersionFromFile,
  type FileEntityType,
} from "../../api/docs";
import { Button } from "../Button";
import { Combobox } from "../Combobox";
import { Modal } from "../Modal";
import { useToast } from "../Toast";
import { useQuery } from "@tanstack/react-query";
import { EntityPicker } from "../parity/EntityPicker";
import type { EntityPickerKind } from "../parity/entityPickerRegistry";
import { companyToday } from "../../lib/businessDate";

type StandaloneLinkType = "driver" | "unit" | "vendor" | "customer" | "load";

const STANDALONE_LINK_TYPES: Array<{ value: StandaloneLinkType; label: string }> = [
  { value: "driver", label: "Driver" },
  { value: "unit", label: "Unit" },
  { value: "vendor", label: "Vendor" },
  { value: "customer", label: "Customer" },
  { value: "load", label: "Load" },
];

function standaloneLinkToPickerKind(type: StandaloneLinkType): EntityPickerKind {
  return type;
}

type UploadModalProps = {
  // Optional: when omitted, the upload is a STANDALONE document (no entity link) —
  // used by the Documents page. Existing entity callers pass all three (unchanged).
  entityType?: FileEntityType;
  entityId?: string;
  entityName?: string;
  parentFileId?: string;
  /** When standalone, pre-select the optional link entity type (e.g. DocsHome active tab). */
  defaultLinkEntityType?: StandaloneLinkType;
  // FIX-2 (docs-upload-viewed-entity): the operating_company_id of the VIEWED entity (the
  // company selected in CompanyContext when the profile was opened). Without this,
  // requestUploadUrl falls back to the server's resolveOperatingCompanyId (the caller's
  // default_company_id), which for a multi-entity user does not necessarily match the company
  // being viewed — so the file gets filed under the wrong entity and never reappears when the
  // profile refetches its company-scoped document list (unit/equipment/driver aggregates all
  // read documents with an exact `f.operating_company_id = $2` match). Always pass the VIEWED
  // company here, never the uploader's default.
  operatingCompanyId?: string;
  onClose: () => void;
  onUploadSuccess: () => void;
};

function todayIso() {
  return companyToday();
}

function uploadWithProgress(
  presignedUrl: string,
  file: File,
  onProgress: (progress: number) => void,
  onRegisterAbort: (abort: () => void) => void
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    onRegisterAbort(() => xhr.abort());
    xhr.open("PUT", presignedUrl);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onerror = () => reject(new Error("network_upload_error"));
    xhr.onabort = () => reject(new Error("upload_aborted"));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
        return;
      }
      reject(new Error(`r2_upload_failed:${xhr.status}`));
    };
    xhr.send(file);
  });
}

export function UploadModal({
  entityType,
  entityId,
  entityName,
  parentFileId,
  defaultLinkEntityType,
  operatingCompanyId,
  onClose,
  onUploadSuccess,
}: UploadModalProps) {
  const { pushToast } = useToast();
  const isStandalone = !entityType && !entityId && !parentFileId;
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [linkEntityType, setLinkEntityType] = useState<StandaloneLinkType | null>(defaultLinkEntityType ?? null);
  const [linkEntityId, setLinkEntityId] = useState<string | null>(null);
  const [documentDate, setDocumentDate] = useState(todayIso());
  const [expirationDate, setExpirationDate] = useState("");
  const [description, setDescription] = useState("");
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortUploadRef = useRef<(() => void) | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ["file-categories", entityType ?? linkEntityType ?? "all"],
    queryFn: () =>
      listFileCategories(entityType ?? linkEntityType ?? undefined).then((result) =>
        result.categories.filter((category) => category.is_active)
      ),
  });

  const resolvedEntityType = entityType ?? (linkEntityId && linkEntityType ? linkEntityType : undefined);
  const resolvedEntityId = entityId ?? linkEntityId ?? undefined;

  const selectedCategory = useMemo(
    () => categoriesQuery.data?.find((category) => category.id === categoryId) ?? null,
    [categoriesQuery.data, categoryId]
  );
  const expirationRequired = selectedCategory?.requires_expiration_date ?? false;

  function normalizeError(error: unknown) {
    if (error instanceof ApiError) {
      if (error.status === 503) return "R2 is not configured on the server.";
      if (error.status === 413) return "File too large for upload.";
      if (error.status === 403) return "You do not have permission to upload here.";
      if (error.status === 409) return "Upload could not be completed due to file state conflict.";
      return `Upload failed (${error.status}).`;
    }
    if (error instanceof Error) {
      if (error.message === "upload_aborted") return "Upload canceled.";
      if (error.message === "network_upload_error") return "Network error while uploading to R2.";
      if (error.message.startsWith("r2_upload_failed:")) {
        return `R2 upload failed (${error.message.replace("r2_upload_failed:", "")}).`;
      }
      return error.message;
    }
    return "Unknown upload error.";
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedFile) {
      setErrorMessage("Select a file first.");
      return;
    }
    if (!categoryId) {
      setErrorMessage("Category is required.");
      return;
    }
    if (expirationRequired && !expirationDate) {
      setErrorMessage("Expiration date is required for this category.");
      return;
    }

    setErrorMessage(null);
    setIsUploading(true);
    setProgress(1);

    try {
      const uploadInit = parentFileId
        ? await uploadNewVersionFromFile(parentFileId, selectedFile)
        : await requestUploadUrlFromFile(selectedFile, {
            category_id: categoryId,
            ...(resolvedEntityType && resolvedEntityId
              ? { entity_links: [{ entity_type: resolvedEntityType, entity_id: resolvedEntityId }] }
              : {}),
            // FIX-2: file under the VIEWED company, not the uploader's default_company_id.
            ...(operatingCompanyId ? { operating_company_id: operatingCompanyId } : {}),
          });

      await uploadWithProgress(uploadInit.presigned_url, selectedFile, setProgress, (abortFn) => {
        abortUploadRef.current = abortFn;
      });

      await confirmUpload(uploadInit.file_id);

      await updateFileMetadata(uploadInit.file_id, {
        category_id: categoryId,
        document_date: documentDate || null,
        expiration_date: expirationDate || null,
        description: description.trim() || null,
      });

      pushToast("Uploaded successfully", "success");
      onUploadSuccess();
      onClose();
    } catch (error) {
      setProgress(0);
      setErrorMessage(normalizeError(error));
    } finally {
      abortUploadRef.current = null;
      setIsUploading(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`${parentFileId ? "Upload New Version" : "Upload Document"}${entityName ? ` - ${entityName}` : ""}`}>
      <form className="space-y-3" onSubmit={handleSubmit}>
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            const file = event.dataTransfer.files[0];
            if (file) setSelectedFile(file);
          }}
          className={`rounded-sm border border-dashed p-4 text-center text-sm ${dragOver ? "border-slate-300 bg-slate-100" : "border-gray-300 bg-gray-50"}`}
        >
          <p className="font-medium text-gray-700">Drag and drop file here</p>
          <p className="text-xs text-gray-500">or click to browse</p>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              setSelectedFile(file);
            }}
          />
          <div className="mt-2">
            <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()}>
              Choose File
            </Button>
          </div>
          {selectedFile ? (
            <div className="mt-2 text-xs text-gray-700">
              {selectedFile.name} ({Math.max(1, Math.round(selectedFile.size / 1024))} KB)
            </div>
          ) : null}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-600">Category</label>
          <Combobox
            options={(categoriesQuery.data ?? []).map((category) => ({
              value: category.id,
              label: category.label,
              sublabel: category.code,
            }))}
            value={categoryId}
            onChange={(value) => setCategoryId(value)}
            loading={categoriesQuery.isLoading}
            placeholder="Select category"
            dataTestId="docs-upload-category-combobox"
          />
        </div>

        {isStandalone && operatingCompanyId ? (
          <div className="space-y-2 rounded-sm border border-gray-200 bg-gray-50 p-3" data-testid="docs-upload-entity-link-panel">
            <div className="text-xs font-semibold text-gray-700">Link to entity (optional)</div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-600">Entity type</label>
              <Combobox
                options={STANDALONE_LINK_TYPES.map((row) => ({ value: row.value, label: row.label }))}
                value={linkEntityType}
                onChange={(value) => {
                  setLinkEntityType((value as StandaloneLinkType | null) ?? null);
                  setLinkEntityId(null);
                }}
                placeholder="None — standalone document"
                allowClear
                dataTestId="docs-upload-link-entity-type"
              />
            </div>
            {linkEntityType ? (
              <EntityPicker
                kind={standaloneLinkToPickerKind(linkEntityType)}
                operatingCompanyId={operatingCompanyId}
                value={linkEntityId}
                onChange={setLinkEntityId}
                placeholder={`Select ${linkEntityType} to link`}
                dataTestId={`docs-upload-link-${linkEntityType}-picker`}
              />
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Document Date</label>
            <DatePicker
              value={documentDate}
              onChange={(next) => setDocumentDate(next)}
              className="h-9 w-full"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">
              Expiration Date {expirationRequired ? <span className="text-crit">(required)</span> : null}
            </label>
            <DatePicker
              value={expirationDate}
              onChange={setExpirationDate}
              className="h-9 w-full"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-600">Description (optional)</label>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            className="w-full rounded-sm border border-gray-300 px-2 py-1.5 text-sm"
          />
        </div>

        {isUploading ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-gray-600">
              <span>Uploading...</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-sm bg-gray-200">
              <div className="h-full bg-slate-1000 transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : null}

        {errorMessage ? <div className="rounded-sm border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">{errorMessage}</div> : null}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              if (isUploading && abortUploadRef.current) {
                abortUploadRef.current();
              }
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button type="submit" loading={isUploading}>
            {isUploading ? "Uploading..." : "Upload"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
