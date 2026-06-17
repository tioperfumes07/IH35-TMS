import { useMemo, useRef, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { ApiError } from "../../api/client";
import {
  confirmUpload,
  listFileCategories,
  requestUploadUrl,
  updateFileMetadata,
  uploadNewVersion,
  type FileEntityType,
} from "../../api/docs";
import { Button } from "../Button";
import { Combobox } from "../Combobox";
import { Modal } from "../Modal";
import { useToast } from "../Toast";
import { useQuery } from "@tanstack/react-query";

type UploadModalProps = {
  // Optional: when omitted, the upload is a STANDALONE document (no entity link) —
  // used by the Documents page. Existing entity callers pass all three (unchanged).
  entityType?: FileEntityType;
  entityId?: string;
  entityName?: string;
  parentFileId?: string;
  onClose: () => void;
  onUploadSuccess: () => void;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
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
  onClose,
  onUploadSuccess,
}: UploadModalProps) {
  const { pushToast } = useToast();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [documentDate, setDocumentDate] = useState(todayIso());
  const [expirationDate, setExpirationDate] = useState("");
  const [description, setDescription] = useState("");
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortUploadRef = useRef<(() => void) | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ["file-categories", entityType ?? "all"],
    queryFn: () => listFileCategories(entityType).then((result) => result.categories.filter((category) => category.is_active)),
  });

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
        ? await uploadNewVersion(parentFileId, {
            original_filename: selectedFile.name,
            mime_type: selectedFile.type || "application/octet-stream",
            size_bytes: selectedFile.size,
          })
        : await requestUploadUrl({
            original_filename: selectedFile.name,
            mime_type: selectedFile.type || "application/octet-stream",
            size_bytes: selectedFile.size,
            category_id: categoryId,
            // standalone upload (Documents page) sends no entity link
            ...(entityType && entityId ? { entity_links: [{ entity_type: entityType, entity_id: entityId }] } : {}),
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
          className={`rounded border border-dashed p-4 text-center text-sm ${dragOver ? "border-sky-400 bg-sky-50" : "border-gray-300 bg-gray-50"}`}
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
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Document Date</label>
            <DatePicker
              value={documentDate}
              onChange={(next) => setDocumentDate(next)}
              className="h-9 w-full rounded border border-gray-300 px-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">
              Expiration Date {expirationRequired ? <span className="text-crit">(required)</span> : null}
            </label>
            <input
              type="date"
              value={expirationDate}
              onChange={(event) => setExpirationDate(event.target.value)}
              required={expirationRequired}
              className="h-9 w-full rounded border border-gray-300 px-2 text-sm"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-600">Description (optional)</label>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
          />
        </div>

        {isUploading ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-gray-600">
              <span>Uploading...</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded bg-gray-200">
              <div className="h-full bg-sky-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : null}

        {errorMessage ? <div className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">{errorMessage}</div> : null}

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
