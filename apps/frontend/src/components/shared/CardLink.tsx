import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";
import { Link } from "react-router-dom";

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  children: ReactNode;
  onNavigate?: () => void;
};

export function CardLink({ href, children, onNavigate, onClick, className, ...rest }: Props) {
  return (
    <Link
      to={href}
      className={className}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (!event.defaultPrevented) onNavigate?.();
      }}
      {...rest}
    >
      {children}
    </Link>
  );
}
