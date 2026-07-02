// NOTIF-A (A1) — full-screen loud-alert takeover. It CANNOT be dismissed except by the single
// Acknowledge button (which posts the existing confirmation_ack path). There is intentionally no
// backdrop click-to-close, no close (X), and no keyboard-dismiss handler — the only interactive
// control is Acknowledge. §7 palette: navy #1f2a44 surface, white text; no emojis.
import { useTranslation } from "react-i18next";

type LoudAlertOverlayProps = {
  visible: boolean;
  title: string;
  body: string;
  acknowledging: boolean;
  onAcknowledge: () => void;
};

export function LoudAlertOverlay({ visible, title, body, acknowledging, onAcknowledge }: LoudAlertOverlayProps) {
  const { t } = useTranslation();
  if (!visible) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
      data-testid="loud-alert-overlay"
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-6 bg-[#1f2a44] px-6 text-center"
    >
      <div className="text-xs font-semibold uppercase tracking-widest text-slate-300">
        {t("loud_alert.tag", "Action required")}
      </div>
      <h1 className="max-w-md text-2xl font-bold text-white">{title}</h1>
      <p className="max-w-md text-base text-slate-200">{body}</p>
      <button
        type="button"
        data-testid="loud-alert-acknowledge"
        disabled={acknowledging}
        onClick={onAcknowledge}
        className="mt-4 w-full max-w-xs rounded bg-white px-6 py-4 text-lg font-bold text-[#1f2a44] disabled:opacity-60"
      >
        {acknowledging ? t("loud_alert.acknowledging", "Acknowledging…") : t("loud_alert.acknowledge", "Acknowledge")}
      </button>
      <p className="max-w-xs text-xs text-slate-400">
        {t("loud_alert.hint", "This alert stays until you acknowledge it.")}
      </p>
    </div>
  );
}
