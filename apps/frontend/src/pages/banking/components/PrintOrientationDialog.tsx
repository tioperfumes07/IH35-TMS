import { useEffect, useId, useState } from "react";

type Props = {
  open: boolean;
  title?: string;
  onCancel: () => void;
  /** Called after orientation CSS is applied; caller should trigger window.print(). */
  onConfirm: (orientation: "portrait" | "landscape") => void;
};

/**
 * QBO-parity print gate: ask Portrait vs Landscape, inject @page size + scale-to-fit,
 * then print. Restores prior print stylesheet on afterprint.
 */
export function PrintOrientationDialog({ open, title = "Print", onCancel, onConfirm }: Props) {
  const titleId = useId();
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("landscape");

  useEffect(() => {
    if (!open) return;
    setOrientation("landscape");
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 p-4" data-testid="print-orientation-dialog">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-sm rounded-sm border border-gray-200 bg-white p-4 shadow-lg"
      >
        <h2 id={titleId} className="text-sm font-semibold text-gray-900">
          {title}
        </h2>
        <p className="mt-1 text-xs text-gray-600">Choose page orientation. The table will auto-adjust to fit the page.</p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className={`flex-1 rounded-sm border px-3 py-2 text-sm ${
              orientation === "portrait" ? "border-[#1f2a44] bg-[#1f2a44] text-white" : "border-gray-300 text-gray-800"
            }`}
            onClick={() => setOrientation("portrait")}
            data-testid="print-orientation-portrait"
          >
            Portrait
          </button>
          <button
            type="button"
            className={`flex-1 rounded-sm border px-3 py-2 text-sm ${
              orientation === "landscape" ? "border-[#1f2a44] bg-[#1f2a44] text-white" : "border-gray-300 text-gray-800"
            }`}
            onClick={() => setOrientation("landscape")}
            data-testid="print-orientation-landscape"
          >
            Landscape
          </button>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-sm border border-gray-300 px-3 py-1.5 text-xs text-gray-700"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-sm border border-[#1f2a44] bg-[#1f2a44] px-3 py-1.5 text-xs text-white"
            data-testid="print-orientation-confirm"
            onClick={() => onConfirm(orientation)}
          >
            Print
          </button>
        </div>
      </div>
    </div>
  );
}

/** Apply @page orientation + fit; returns cleanup that removes the style tag. */
export function applyPrintOrientationStyles(orientation: "portrait" | "landscape"): () => void {
  const style = document.createElement("style");
  style.setAttribute("data-ih35-print-orientation", "1");
  style.textContent = `
    @media print {
      @page { size: ${orientation}; margin: 0.4in; }
      html, body { height: auto !important; }
      table { width: 100% !important; table-layout: auto !important; }
      .no-print, [data-testid="print-orientation-dialog"] { display: none !important; }
    }
  `;
  document.head.appendChild(style);
  return () => {
    style.remove();
  };
}
