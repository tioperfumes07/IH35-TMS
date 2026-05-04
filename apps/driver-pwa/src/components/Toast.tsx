import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

type Variant = "info" | "success" | "error";

type ToastItem = {
  id: string;
  message: string;
  variant: Variant;
};

type ToastContextValue = {
  pushToast: (message: string, variant?: Variant) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

function variantClasses(variant: Variant): string {
  if (variant === "success") return "border-hos-driving/40 bg-hos-driving/15 text-hos-driving";
  if (variant === "error") return "border-hos-violation/40 bg-hos-violation/15 text-hos-violation";
  return "border-hos-offduty_reset/40 bg-hos-offduty_reset/15 text-hos-offduty_reset";
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const value = useMemo(
    () => ({
      pushToast: (message: string, variant: Variant = "info") => {
        const id = crypto.randomUUID();
        setToasts((prev) => [...prev, { id, message, variant }]);
        window.setTimeout(() => {
          setToasts((prev) => prev.filter((toast) => toast.id !== id));
        }, 3500);
      },
    }),
    []
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed left-4 right-4 top-4 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <div key={toast.id} className={`rounded-xl border px-3 py-2 text-sm font-medium ${variantClasses(toast.variant)}`}>
            {toast.message}
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
