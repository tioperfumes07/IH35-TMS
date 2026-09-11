import { useNavigate } from "react-router-dom";
import { hasInAppHistory } from "../../lib/smart-back";

type Props = {
  label?: string;
  /** REG-007 (owner 2026-08-25 "take you back to the correct module, the one you went from"): the named
   *  route to land on when there is NO real in-app history (a direct URL load/refresh) — never a bare
   *  navigate(-1) that would leave the SPA. When real history exists we honor it (navigate(-1)). */
  fallbackTo?: string;
};

export function BackButton({ label = "Back", fallbackTo = "/" }: Props) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => {
        if (hasInAppHistory(window.history.state)) {
          navigate(-1);
          return;
        }
        navigate(fallbackTo);
      }}
      className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:underline"
      aria-label={label}
    >
      <span aria-hidden="true">←</span>
      <span>{label}</span>
    </button>
  );
}
