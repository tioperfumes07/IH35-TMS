import type { ReactNode } from "react";

type Props = {
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  "data-testid"?: string;
};

export function ActionButton({
  onClick,
  children,
  className = "",
  type = "button",
  disabled = false,
  "data-testid": dataTestId,
}: Props) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      data-testid={dataTestId}
      className={`inline-flex items-center bg-transparent px-0 py-0 text-xs font-bold text-[#1f2a44] hover:underline disabled:cursor-not-allowed disabled:opacity-50 ${className}`.trim()}
    >
      {children}
    </button>
  );
}
