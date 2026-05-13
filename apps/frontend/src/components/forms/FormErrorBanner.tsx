export function FormErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-red-900">Could not save</div>
      <div className="text-sm text-red-900">{message}</div>
    </div>
  );
}
