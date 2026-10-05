import { useLocation, useNavigate } from "react-router-dom";
import { structuralParentHref } from "../../lib/structuralBreadcrumb";

type Props = {
  label?: string;
  /** ROUND 367.9 — structural parent when set; otherwise derived from the route. Never navigate(-1). */
  fallbackTo?: string;
};

export function BackButton({ label = "Back", fallbackTo }: Props) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <button
      type="button"
      onClick={() => {
        navigate(fallbackTo || structuralParentHref(pathname));
      }}
      className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:underline"
      aria-label={label}
    >
      <span aria-hidden="true">←</span>
      <span>{label}</span>
    </button>
  );
}
