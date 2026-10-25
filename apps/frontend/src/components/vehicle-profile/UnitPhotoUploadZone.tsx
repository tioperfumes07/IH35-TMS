import { useRef, useState } from "react";
import { apiRequest } from "../../api/client";
import { confirmUpload, requestUploadUrlFromFile, uploadFileToR2 } from "../../api/docs";

const PHOTO_TYPES = ["exterior", "interior", "damage", "mod", "cleanliness", "other"] as const;
type PhotoType = (typeof PHOTO_TYPES)[number];

async function uploadUnitPhoto(
  file: File,
  unitId: string,
  companyId: string,
  photoType: PhotoType,
  caption: string
) {
  const { file_id, presigned_url } = await requestUploadUrlFromFile(file, {
    operating_company_id: companyId,
    entity_links: [{ entity_type: "unit", entity_id: unitId }],
  });
  await uploadFileToR2(presigned_url, file, file.type || "application/octet-stream");
  await confirmUpload(file_id);
  await apiRequest(`/api/v1/mdata/units/${unitId}/photos?operating_company_id=${encodeURIComponent(companyId)}`, {
    method: "POST",
    body: {
      docs_file_id: file_id,
      photo_type: photoType,
      caption: caption.trim() || undefined,
    },
  });
  return file_id;
}

export function UnitPhotoUploadZone({
  unitId,
  companyId,
  onUploaded,
}: {
  unitId: string;
  companyId: string;
  onUploaded: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [photoType, setPhotoType] = useState<PhotoType>("exterior");
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        await uploadUnitPhoto(file, unitId, companyId, photoType, caption);
      }
      setCaption("");
      onUploaded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="mt-3 rounded-sm border border-dashed border-gray-300 p-3" data-testid="vp-photo-upload-zone">
      <div className="mb-2 flex flex-wrap gap-2">
        <label className="text-xs font-medium text-gray-600">
          Type
          <select
            value={photoType}
            onChange={(e) => setPhotoType(e.target.value as PhotoType)}
            className="ml-1 rounded-sm border border-gray-200 px-1 py-0.5 text-xs"
            data-testid="vp-photo-type-select"
          >
            {PHOTO_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex-1 text-xs font-medium text-gray-600">
          Caption
          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Optional"
            maxLength={200}
            className="ml-1 w-full rounded-sm border border-gray-200 px-1 py-0.5 text-xs"
            data-testid="vp-photo-caption-input"
          />
        </label>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => void handleFiles(e.target.files)}
        disabled={uploading}
        className="hidden"
        data-testid="vp-photo-file-input"
        id={`unit-photo-upload-${unitId}`}
      />
      <label
        htmlFor={`unit-photo-upload-${unitId}`}
        className="flex cursor-pointer items-center justify-center rounded-sm border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 hover:bg-gray-100"
        data-testid="vp-photo-upload-btn"
      >
        {uploading ? "Uploading…" : "Add photos"}
      </label>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
