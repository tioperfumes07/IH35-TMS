type Props = {
  maxMilesPerShift: number;
  maxOffHighwayMiles: number;
  maxBackwardsMiles: number;
};

export function HosRulesBox({ maxMilesPerShift, maxOffHighwayMiles, maxBackwardsMiles }: Props) {
  return (
    <div className="rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] px-3 py-2 text-xs text-[#1F2A44]">
      FMCSA HOS: 11hr drive / 14hr on-duty / 30min break after 8hr · Per Shift: {maxMilesPerShift}mi · Off-Highway: {maxOffHighwayMiles}mi · Backwards: {maxBackwardsMiles}mi
    </div>
  );
}
