import type { CSSProperties, ReactNode } from "react";

type Props = {
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  "data-testid"?: string;
  /** A V3 board's own action style (PageHeader V3_HEADER_ACTION_STYLE) — the board's values win over the defaults. */
  style?: CSSProperties;
};

export function ActionButton({
  onClick,
  children,
  className = "",
  type = "button",
  disabled = false,
  "data-testid": dataTestId,
  style,
}: Props) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      data-testid={dataTestId}
      style={style}
      className={`inline-flex items-center bg-transparent px-0 py-0 text-xs font-bold text-[#1F2A44] hover:underline disabled:cursor-not-allowed disabled:opacity-50 ${className}`.trim()}
    >
      {children}
    </button>
  );
}
