import { useEffect, useState } from "react";
import { getDownloadUrl, type DocsFile } from "../../api/docs";
import { ApiError } from "../../api/client";
import { Button } from "../Button";
import { Modal } from "../Modal";

type PreviewModalProps = {
  file: DocsFile;
  canEditMetadata: boolean;
  onClose: () => void;
  onRequestEditMetadata: () => void;
};

function isImage(mimeType: string) {
  return mimeType.startsWith("image/");
}

function isPdf(mimeType: string) {
  return mimeType === "application/pdf";
}

export function PreviewModal({ file, canEditMetadata, onClose, onRequestEditMetadata }: PreviewModalProps) {
  const [downloadUrl, setDownloadUrl] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();
    async function run() {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const result = await getDownloadUrl(file.id);
        if (!isMounted) return;
        setDownloadUrl(result.presigned_url);
      } catch (error) {
        if (!isMounted) return;
        if (error instanceof ApiError && error.status === 503) {
          setErrorMessage("R2 is not configured.");
        } else {
          setErrorMessage("Unable to load preview URL.");
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    void run();
    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [file.id]);

  return (
    <Modal open onClose={onClose} title={`Preview - ${file.original_filename}`}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 rounded border border-gray-200 bg-gray-50 p-2 text-xs text-gray-700">
          <div>
            <span className="font-semibold">Category:</span> {file.category_label ?? "Uncategorized"}
          </div>
          <div>
            <span className="font-semibold">Uploader:</span> {file.uploader_email ?? file.uploader_user_id}
          </div>
          <div>
            <span className="font-semibold">Uploaded:</span> {new Date(file.created_at).toLocaleString()}
          </div>
          <div>
            <span className="font-semibold">Version:</span> v{file.version_number}
          </div>
        </div>

        <div className="rounded border border-gray-200 bg-white p-2">
          {isLoading ? <div className="text-sm text-gray-500">Loading preview...</div> : null}
          {!isLoading && errorMessage ? <div className="text-sm text-red-600">{errorMessage}</div> : null}
          {!isLoading && !errorMessage && downloadUrl && isImage(file.mime_type) ? (
            <img src={downloadUrl} alt={file.original_filename} className="max-h-[60vh] w-full rounded object-contain" />
          ) : null}
          {!isLoading && !errorMessage && downloadUrl && isPdf(file.mime_type) ? (
            <object data={downloadUrl} type="application/pdf" className="h-[60vh] w-full rounded border border-gray-200">
              <p className="p-3 text-sm text-gray-600">PDF preview unavailable in this browser. Use Download.</p>
            </object>
          ) : null}
          {!isLoading && !errorMessage && downloadUrl && !isImage(file.mime_type) && !isPdf(file.mime_type) ? (
            <div className="p-3 text-sm text-gray-600">Preview not available for this file type. Download to view.</div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2">
          {canEditMetadata ? (
            <Button type="button" variant="secondary" onClick={onRequestEditMetadata}>
              Edit Metadata
            </Button>
          ) : null}
          <a href={downloadUrl || "#"} target="_blank" rel="noreferrer">
            <Button type="button" disabled={!downloadUrl || Boolean(errorMessage)}>
              Download
            </Button>
          </a>
        </div>
      </div>
    </Modal>
  );
}
