type Photo = {
  id: string;
  url: string;
  type: string;
  caption?: string | null;
  taken_at?: string | null;
};

export function PhotoGallery({ photos }: { photos: Photo[] }) {
  if (photos.length === 0) return <p className="mt-2 text-xs text-gray-500">No driver photos yet.</p>;
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="vp-photo-gallery">
      {photos.map((p) => (
        <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="block rounded border border-gray-200 p-1">
          <div className="flex h-20 items-center justify-center bg-gray-100 text-xs text-gray-500">Photo</div>
          <div className="mt-1 text-[10px] uppercase text-gray-500">{p.type}</div>
          <div className="truncate text-xs">{p.caption ?? "—"}</div>
          <div className="text-[10px] text-gray-400">{p.taken_at?.slice(0, 10) ?? ""}</div>
        </a>
      ))}
    </div>
  );
}
