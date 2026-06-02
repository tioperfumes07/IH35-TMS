export function StatusChangeModal({ open }: { open: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" data-testid="tp-status-change-modal">
      <div className="w-full max-w-md rounded bg-white p-4 shadow-lg">
        <h3 className="text-sm font-semibold">Change trailer status</h3>
        <p className="mt-2 text-xs text-gray-600">Status change requires a reason (wired in follow-up).</p>
      </div>
    </div>
  );
}
