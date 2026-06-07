import { useTranslation } from "react-i18next";

type Props = {
  angle: string;
  instruction: string;
};

export function AngleGuide({ angle, instruction }: Props) {
  const { t } = useTranslation();
  return (
    <div
      className="pointer-events-none absolute inset-0 flex flex-col items-center justify-end pb-6"
      data-testid="angle-guide"
    >
      <div className="rounded-lg border border-white/40 bg-black/60 px-4 py-3 text-center text-white backdrop-blur-sm">
        <p className="text-xs uppercase tracking-widest text-white/70">{t("photo.angle_label")}</p>
        <p className="text-lg font-semibold">{angle}</p>
        <p className="mt-1 max-w-xs text-sm text-white/90">{instruction}</p>
      </div>
      <div className="mt-4 h-32 w-48 rounded border-2 border-dashed border-white/50" aria-hidden />
    </div>
  );
}
