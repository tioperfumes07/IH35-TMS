import type { ReactNode } from "react";
import "../../styles/breakpoints-edge.css";

type UltraWideContainerProps = {
  children: ReactNode;
  className?: string;
};

export function UltraWideContainer({ children, className }: UltraWideContainerProps) {
  const composedClassName = ["edge-ultrawide-shell", className].filter(Boolean).join(" ");
  return <div className={composedClassName}>{children}</div>;
}
