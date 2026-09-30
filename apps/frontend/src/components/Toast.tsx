import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

type ToastVariant = "success" | "error" | "info";

type ToastItem = {
  id: string;
  message: string;
  variant: ToastVariant;
};

type ToastContextValue = {
  pushToast: (message: string, variant?: ToastVariant) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

function variantClasses(variant: ToastVariant) {
  if (variant === "success") return "border-ok/30 bg-ok/10 text-ok";
  if (variant === "error") return "border-crit/30 bg-crit/10 text-crit";
  return "border-info/30 bg-info/10 text-info";
}

/**
 * C-52 — house alert surface for every module: fixed side-dock, smaller chips,
 * never in document flow (no layout shift). rounded-sm (SQUARE-EDGES LAW).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      pushToast: (message: string, variant: ToastVariant = "info") => {
        const id = crypto.randomUUID();
        setToasts((prev) => [...prev, { id, message, variant }].slice(-5));
        window.setTimeout(() => {
          setToasts((prev) => prev.filter((toast) => toast.id !== id));
        }, variant === "success" ? 10_000 : 6_000);
      },
    }),
    []
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-3 right-3 z-[230] flex w-72 max-w-[min(18rem,calc(100vw-1.5rem))] flex-col gap-1.5"
        data-testid="toast-side-dock"
        data-c52-alert-dock="1"
        aria-live="polite"
        aria-relevant="additions"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="alert"
            data-testid="toast-message"
            data-variant={toast.variant}
            className={`pointer-events-auto flex items-start gap-2 rounded-sm border px-2 py-1.5 text-xs font-medium shadow-sm ${variantClasses(toast.variant)}`}
          >
            <span className="min-w-0 flex-1 leading-snug">{toast.message}</span>
            <button
              type="button"
              className="shrink-0 text-xs font-bold uppercase tracking-wide opacity-70 hover:opacity-100"
              aria-label="Dismiss"
              data-testid="toast-dismiss"
              onClick={() => dismiss(toast.id)}
            >
              Close
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
