import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { resolveBackHref } from "../../lib/returnContext";

type Props = {
  label?: string;
  /** ROUND 367.9 — structural parent when set; otherwise derived from the route. Never navigate(-1). */
  fallbackTo?: string;
};

export function BackButton({ label = "Back", fallbackTo }: Props) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();

  return (
    <button
      type="button"
      onClick={() => {
        // ROUND 8.17 — `ret` restores origin board state; else in-module structural parent.
        navigate(resolveBackHref({ searchParams, pathname, fallback: fallbackTo }));
      }}
      className="inline-flex items-center gap-1 text-xs font-semibold text-[#1F2A44] hover:text-[#0F1219] hover:underline"
      aria-label={label}
    >
      <span aria-hidden="true">←</span>
      <span>{label}</span>
    </button>
  );
}
