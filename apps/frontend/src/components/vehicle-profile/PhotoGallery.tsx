type Photo = {
  id: string;
  /** Resolved download URL (signed for R2, raw for legacy). Null/undefined = no preview. */
  url?: string | null;
  /** Photo type from mdata.unit_photos.photo_type */
  type?: string;
  /** Used by the detail endpoint */
  photo_type?: string;
  caption?: string | null;
  taken_at?: string | null;
  is_primary?: boolean;
};

export function PhotoGallery({ photos, onArchive }: { photos: Photo[]; onArchive?: (id: string) => void }) {
  if (photos.length === 0) return <p className="mt-2 text-xs text-gray-500">No unit photos yet.</p>;
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="vp-photo-gallery">
      {photos.map((p) => {
        const displayUrl = p.url ?? undefined;
        const label = p.type ?? p.photo_type ?? "";
        return (
          <div key={p.id} className="relative rounded-sm border border-gray-200 p-1" data-testid={`vp-photo-${p.id}`}>
            <a
              href={displayUrl ?? "#"}
              target={displayUrl ? "_blank" : undefined}
              rel="noreferrer"
              className="block"
              aria-label={label}
            >
              {displayUrl ? (
                <img
                  src={displayUrl}
                  alt={label}
                  className="h-20 w-full rounded-sm object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-20 items-center justify-center rounded-sm bg-gray-100 text-xs text-gray-400">
                  No preview
                </div>
              )}
            </a>
            <div className="mt-1 flex items-center gap-1">
              <span className="flex-1 truncate text-xs uppercase text-gray-500">{label}</span>
              {p.is_primary && (
                <span className="rounded-sm bg-[#16A34A] px-1 text-[10px] font-semibold text-white">Primary</span>
              )}
            </div>
            <div className="truncate text-xs text-gray-700">{p.caption ?? "—"}</div>
            <div className="text-xs text-gray-400">{p.taken_at?.slice(0, 10) ?? ""}</div>
            {onArchive && (
              <button
                type="button"
                onClick={() => onArchive(p.id)}
                className="mt-1 text-xs text-red-600 hover:underline"
                data-testid={`vp-photo-archive-${p.id}`}
              >
                Remove
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
