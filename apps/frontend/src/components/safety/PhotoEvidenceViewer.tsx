type ExifPanel = {
  DateTimeOriginal?: string;
  GPSLatitude?: number;
  GPSLongitude?: number;
  Make?: string;
  Model?: string;
  Software?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  imageUrl?: string;
  sha256?: string;
  exif?: ExifPanel;
};

export function PhotoEvidenceViewer({ open, onClose, imageUrl, sha256, exif }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex bg-black/70 p-4" data-testid="photo-evidence-viewer">
      <div className="mx-auto flex w-full max-w-5xl gap-3 rounded border border-slate-200 bg-white p-3">
        <div className="flex-1">
          {imageUrl ? (
            <img src={imageUrl} alt="Damage evidence" className="max-h-[70vh] w-full object-contain" />
          ) : (
            <div className="flex h-64 items-center justify-center rounded border border-dashed border-slate-300 text-sm text-slate-500">
              No preview URL
            </div>
          )}
        </div>
        <aside className="w-64 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">EXIF metadata</h3>
            <button type="button" className="text-slate-500 hover:text-slate-800" onClick={onClose}>
              Close
            </button>
          </div>
          <dl className="space-y-1 text-slate-600">
            <div>
              <dt className="font-semibold">SHA-256</dt>
              <dd className="break-all font-mono text-[10px]">{sha256 ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-semibold">Captured</dt>
              <dd>{exif?.DateTimeOriginal ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-semibold">Device</dt>
              <dd>
                {[exif?.Make, exif?.Model].filter(Boolean).join(" ") || "—"}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Software</dt>
              <dd>{exif?.Software ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-semibold">GPS</dt>
              <dd>
                {exif?.GPSLatitude != null && exif?.GPSLongitude != null
                  ? `${exif.GPSLatitude.toFixed(5)}, ${exif.GPSLongitude.toFixed(5)}`
                  : "—"}
              </dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  );
}
