import { useEffect, useState } from "react";
import { Modal } from "../../../components/Modal";

type Props = {
  open: boolean;
  title?: string;
  onCancel: () => void;
  /** Called with chosen orientation; caller opens a letter HTML print (never SPA window.print). */
  onConfirm: (orientation: "portrait" | "landscape") => void;
};

/**
 * QBO-parity print gate: ask Portrait vs Landscape, inject @page size + scale-to-fit,
 * then print. Restores prior print stylesheet on afterprint.
 * FINAL-3 443.365-A — shared <Modal size="sm"> (decision), not a hand-built overlay shell.
 */
export function PrintOrientationDialog({ open, title = "Print", onCancel, onConfirm }: Props) {
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("landscape");

  useEffect(() => {
    if (!open) return;
    setOrientation("landscape");
  }, [open]);

  return (
    <Modal open={open} onClose={onCancel} title={title} size="sm" modalKind="print-orientation">
      <div className="space-y-3 text-xs" data-testid="print-orientation-dialog">
        <p className="text-gray-600">Choose page orientation. The table will auto-adjust to fit the page.</p>
        <div className="flex gap-2">
          <button
            type="button"
            className={`flex-1 rounded-sm border px-3 py-2 text-xs ${
              orientation === "portrait" ? "border-[#1F2A44] bg-[#1F2A44] text-white" : "border-gray-300 text-gray-800"
            }`}
            onClick={() => setOrientation("portrait")}
            data-testid="print-orientation-portrait"
          >
            Portrait
          </button>
          <button
            type="button"
            className={`flex-1 rounded-sm border px-3 py-2 text-xs ${
              orientation === "landscape" ? "border-[#1F2A44] bg-[#1F2A44] text-white" : "border-gray-300 text-gray-800"
            }`}
            onClick={() => setOrientation("landscape")}
            data-testid="print-orientation-landscape"
          >
            Landscape
          </button>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="rounded-sm border border-gray-300 px-3 py-1.5 text-xs text-gray-700" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="rounded-sm border border-[#1F2A44] bg-[#1F2A44] px-3 py-1.5 text-xs text-white"
            data-testid="print-orientation-confirm"
            onClick={() => onConfirm(orientation)}
          >
            Print
          </button>
        </div>
      </div>
    </Modal>
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
