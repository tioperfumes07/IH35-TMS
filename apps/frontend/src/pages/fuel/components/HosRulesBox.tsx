type Props = {
  maxMilesPerShift: number;
  maxOffHighwayMiles: number;
  maxBackwardsMiles: number;
};

export function HosRulesBox({ maxMilesPerShift, maxOffHighwayMiles, maxBackwardsMiles }: Props) {
  return (
    <div className="rounded border border-slate-300 bg-slate-100 px-3 py-2 text-xs text-slate-700">
      FMCSA HOS: 11hr drive / 14hr on-duty / 30min break after 8hr · Per Shift: {maxMilesPerShift}mi · Off-Highway: {maxOffHighwayMiles}mi · Backwards: {maxBackwardsMiles}mi
    </div>
  );
}
