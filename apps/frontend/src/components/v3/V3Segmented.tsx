/**
 * ROUND 443.250 — shared segmented control (shell navy active).
 */
import { V3 } from "../../design/v3-tokens";

export type V3SegmentOption<T extends string> = { id: T; label: string };

export function V3Segmented<T extends string>({
  value,
  options,
  onChange,
  testId,
  box = "content-box",
}: {
  value: T;
  options: V3SegmentOption<T>[];
  onChange: (next: T) => void;
  testId?: string;
  /**
   * docs/design/v3: the module boards draw segments as <span>s (content-box — the default); the report family
   * (Dispatch-LoadHistory, Reports-*) draws <button>s, which are border-box. Reader 11-16 02:45Z: CashFlow / Maintenance /
   * Customers / TB want content-box, Reports-* want border-box.
   */
  box?: "content-box" | "border-box";
}) {
  return (
    <span
      data-testid={testId}
      style={{
        display: "inline-flex",
        background: V3.surface,
        border: `1px solid ${V3.border}`,
        // Every approved design (20 of 20 .dc.html with a segmented control): container radius 6, segment radius 4.
        borderRadius: 6,
        padding: 2,
        gap: 2,
        fontFamily: V3.font,
      }}
    >
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            style={{
              boxSizing: box,
              padding: "4px 10px",
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              background: active ? V3.shell : "transparent",
              color: active ? V3.onShell : V3.muted,
              fontFamily: V3.font,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </span>
  );
}
