import type { ReactNode } from "react";

type Props = {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
};

export function Modal({ open, title, children, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 bg-pwa-bg/95">
      <div className="flex h-full flex-col p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-pwa-text-primary">{title}</h2>
          <button type="button" onClick={onClose} className="min-h-11 rounded-xl px-3 text-sm text-pwa-text-secondary active:bg-pwa-card">
            Close
          </button>
        </div>
        <div className="flex-1 overflow-auto rounded-xl border border-pwa-border bg-pwa-card p-4">{children}</div>
      </div>
    </div>
  );
}
