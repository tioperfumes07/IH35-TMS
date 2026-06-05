import type { DvirInspectionItem, DvirStatus } from "../api/dvir";
import { useTranslation } from "react-i18next";

export const MAX_DVIR_DEFECT_PHOTOS = 5;

const STATUS_BUTTONS: Array<{ key: DvirStatus; bg: string; text: string }> = [
  { key: "pass", bg: "#14532d", text: "#4ade80" },
  { key: "minor", bg: "#92400e", text: "#fcd34d" },
  { key: "major", bg: "#7f1d1d", text: "#fca5a5" },
];

type Props = {
  item: DvirInspectionItem;
  label: string;
  onStatusChange: (status: DvirStatus) => void;
  onNoteChange: (note: string) => void;
  onAddPhoto: () => void;
  noteRequiredLabel: string;
  photoRequiredLabel: string;
};

export function DvirItemRow({
  item,
  label,
  onStatusChange,
  onNoteChange,
  onAddPhoto,
  noteRequiredLabel,
  photoRequiredLabel,
}: Props) {
  const { t } = useTranslation();
  const isMajor = item.status === "major";
  return (
    <div className="rounded-lg border border-pwa-border bg-pwa-card p-3">
      <div className="text-sm font-semibold">{label}</div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {STATUS_BUTTONS.map((status) => (
          <button
            key={status.key}
            type="button"
            onClick={() => onStatusChange(status.key)}
            className="min-h-11 rounded border text-xs font-semibold uppercase tracking-[0.04em]"
            style={item.status === status.key ? { backgroundColor: status.bg, color: status.text, borderColor: status.bg } : undefined}
          >
            {t(`dvir.status.${status.key}`)}
          </button>
        ))}
      </div>
      <textarea
        value={item.note}
        onChange={(event) => onNoteChange(event.target.value)}
        placeholder={isMajor ? noteRequiredLabel : ""}
        className="mt-2 h-20 w-full rounded border border-pwa-border bg-[#101522] p-2 text-sm text-pwa-text-primary"
      />
      <div className="mt-2 flex items-center justify-between">
        <button
          type="button"
          disabled={item.photo_keys.length >= MAX_DVIR_DEFECT_PHOTOS}
          onClick={onAddPhoto}
          className="min-h-11 rounded border border-pwa-border px-3 text-xs font-semibold text-pwa-text-secondary disabled:opacity-40"
        >
          {t("dvir.add_photo")}
        </button>
        <div className="text-xs text-pwa-text-secondary">
          {item.photo_keys.length} {photoRequiredLabel}
        </div>
      </div>
    </div>
  );
}
