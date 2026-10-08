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
        <div key={side.label} className="rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] p-2">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
            {side.label}
            {angleLabel ? ` · ${angleLabel}` : ""}
          </p>
          {side.imageUrl ? (
            <img src={side.imageUrl} alt={side.label} className="max-h-64 w-full object-contain" />
          ) : (
            <div className="flex h-48 items-center justify-center text-xs text-[#6B7280]">
              No image
            </div>
          )}
          {side.sha256 ? (
            <p className="mt-2 break-all font-mono text-xs text-[#6B7280]">{side.sha256.slice(0, 24)}…</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
