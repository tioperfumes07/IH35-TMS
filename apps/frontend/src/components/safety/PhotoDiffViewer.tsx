type PhotoSide = {
  label: string;
  imageUrl?: string;
  sha256?: string;
};

type Props = {
  pre: PhotoSide;
  post: PhotoSide;
  angleLabel?: string;
};

export function PhotoDiffViewer({ pre, post, angleLabel }: Props) {
  return (
    <div className="grid gap-3 md:grid-cols-2" data-testid="photo-diff-viewer">
      {[pre, post].map((side) => (
        <div key={side.label} className="rounded border border-slate-200 bg-slate-50 p-2">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {side.label}
            {angleLabel ? ` · ${angleLabel}` : ""}
          </p>
          {side.imageUrl ? (
            <img src={side.imageUrl} alt={side.label} className="max-h-64 w-full object-contain" />
          ) : (
            <div className="flex h-48 items-center justify-center rounded border border-dashed border-slate-300 text-xs text-slate-500">
              No image
            </div>
          )}
          {side.sha256 ? (
            <p className="mt-2 break-all font-mono text-[10px] text-slate-500">{side.sha256.slice(0, 24)}…</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
