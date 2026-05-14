import { HelpCircle } from "lucide-react";
import { useLocation } from "react-router-dom";
import { faqHelpUrl, resolveHelpUrl } from "../config/help-links";

type Props = {
  className?: string;
};

export function PageHelpLink({ className }: Props) {
  const { pathname } = useLocation();
  const href = resolveHelpUrl(pathname);
  if (!href) return null;

  const label = "Help for this page";
  const baseClass =
    "inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded border border-slate-600/80 text-slate-200 hover:bg-white/10";
  const merged = className ? `${baseClass} ${className}` : baseClass;

  return (
    <a href={href} target="_blank" rel="noreferrer" aria-label={label} title={label} className={merged}>
      <HelpCircle className="h-4 w-4" strokeWidth={2} />
    </a>
  );
}

export function FooterFaqLink({ className }: { className?: string }) {
  const href = faqHelpUrl();
  const base = "inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700";
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={className ? `${base} ${className}` : base}
      aria-label="Open FAQ in new tab"
    >
      <HelpCircle className="h-3.5 w-3.5" />
      FAQ
    </a>
  );
}
