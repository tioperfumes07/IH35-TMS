import type { ReactNode } from "react";

type Props = {
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  "aria-label"?: string;
};

export function ActionButton({ onClick, children, className = "", type = "button", disabled = false, ...rest }: Props) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center bg-transparent px-0 py-0 text-xs font-bold text-[#1f2a44] hover:underline disabled:cursor-not-allowed disabled:opacity-50 ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  );
}

