import { useTranslation } from "react-i18next";
import type { LoadLifecycleStage } from "../api/loads";

type Props = {
  stage: LoadLifecycleStage;
};

const STAGE_STYLE: Record<LoadLifecycleStage, string> = {
  pre_trip: "bg-[#404756] text-[#cbd5e1]",
  en_route_pickup: "bg-[#1e3a8a] text-[#93c5fd]",
  at_shipper: "bg-[#14532d] text-[#86efac]",
  loading: "bg-[#92400e] text-[#fcd34d]",
  loaded: "bg-[#1e40af] text-[#bfdbfe]",
  en_route_delivery: "bg-[#1e3a8a] text-[#93c5fd]",
  at_receiver: "bg-[#14532d] text-[#86efac]",
  unloading: "bg-[#92400e] text-[#fcd34d]",
  unloaded: "bg-[#14532d] text-[#4ade80]",
  detention: "border border-[#f59e0b] text-[#fcd34d]",
  hos_break: "bg-[#581c87] text-[#c4b5fd]",
  off_duty: "bg-[#404756] text-[#94a3b8]",
  accident: "border border-[#dc2626] text-[#fca5a5]",
  breakdown: "border border-[#dc2626] text-[#fca5a5]",
  no_gps: "border border-dashed border-[#f59e0b] text-[#fcd34d]",
};

export function LifecyclePill({ stage }: Props) {
  const { t } = useTranslation();
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] ${STAGE_STYLE[stage]}`}>{t(`lifecycle.${stage}`)}</span>;
}
