import { useRef } from "react";
import { PwaButton } from "../PwaButton";

export type IncidentPhotoExifMeta = {
  exif_present: boolean;
  size_bytes: number;
  mime_type: string;
  last_modified_at: string;
};

export type IncidentPhotoEntry = {
  id: string;
  file: File;
  preview_url: string;
  exif: IncidentPhotoExifMeta;
};

function toIso(timestamp: number) {
  return new Date(timestamp).toISOString();
}

async function readExifMeta(file: File): Promise<IncidentPhotoExifMeta> {
  const head = await file.slice(0, Math.min(file.size, 256 * 1024)).arrayBuffer();
  const bytes = new Uint8Array(head);
  let exifPresent = false;
  // Detect EXIF APP1 marker in JPEG files without mutating image bytes.
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    for (let i = 2; i < bytes.length - 10; i += 1) {
      if (bytes[i] === 0xff && bytes[i + 1] === 0xe1) {
        const exifHeader = String.fromCharCode(
          bytes[i + 4] ?? 0,
          bytes[i + 5] ?? 0,
          bytes[i + 6] ?? 0,
          bytes[i + 7] ?? 0
        );
        if (exifHeader === "Exif") {
          exifPresent = true;
          break;
        }
      }
    }
  }
  return {
    exif_present: exifPresent,
    size_bytes: file.size,
    mime_type: file.type || "application/octet-stream",
    last_modified_at: toIso(file.lastModified || Date.now()),
  };
}

export function PhotoChain({
  photos,
  onChange,
  labels,
}: {
  photos: IncidentPhotoEntry[];
  onChange: (next: IncidentPhotoEntry[]) => void;
  labels: {
    title: string;
    add: string;
    add_more: string;
    remove: string;
    exif: string;
    none: string;
  };
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function onFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const created: IncidentPhotoEntry[] = [];
    for (const file of Array.from(fileList)) {
      const exif = await readExifMeta(file);
      created.push({
        id: crypto.randomUUID(),
        file,
        preview_url: URL.createObjectURL(file),
        exif,
      });
    }
    onChange([...photos, ...created]);
  }

  function removePhoto(id: string) {
    const current = photos.find((photo) => photo.id === id);
    if (current) URL.revokeObjectURL(current.preview_url);
    onChange(photos.filter((photo) => photo.id !== id));
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-pwa-text-secondary">{labels.title}</div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(event) => void onFilesSelected(event.target.files)}
      />
      <PwaButton variant="secondary" className="w-full" onClick={() => inputRef.current?.click()}>
        {photos.length === 0 ? labels.add : labels.add_more}
      </PwaButton>

      {photos.length === 0 ? (
        <div className="rounded-lg border border-dashed border-pwa-border p-3 text-xs text-pwa-text-secondary">{labels.none}</div>
      ) : (
        <div className="space-y-2">
          {photos.map((photo) => (
            <div key={photo.id} className="rounded-lg border border-pwa-border bg-[#111827] p-2">
              <div className="flex gap-2">
                <img src={photo.preview_url} alt="" className="h-16 w-16 rounded object-cover" />
                <div className="flex-1 text-xs text-pwa-text-secondary">
                  <div>{Math.max(1, Math.round(photo.exif.size_bytes / 1024))} KB</div>
                  <div>{photo.exif.mime_type}</div>
                  <div>
                    {labels.exif}: {photo.exif.exif_present ? "yes" : "no"}
                  </div>
                </div>
                <button
                  type="button"
                  className="text-xs text-[#fca5a5]"
                  onClick={() => removePhoto(photo.id)}
                  aria-label={labels.remove}
                >
                  {labels.remove}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
