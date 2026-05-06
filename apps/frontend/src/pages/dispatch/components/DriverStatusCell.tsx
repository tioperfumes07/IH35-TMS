import type { DispatchConfidenceClass, DispatchLifecycleStage } from "../../../api/dispatch";

type Props = {
  lifecycle: DispatchLifecycleStage;
  etaConfidence?: DispatchConfidenceClass | null;
  etaText?: string | null;
  onClick?: () => void;
};

const lifecycleLabel: Record<DispatchLifecycleStage, string> = {
  pretrip: "Pretrip",
  enroute_pu: "Enroute PU",
  at_shipper: "At Shipper",
  loading: "Loading",
  loaded: "Loaded",
  enroute_del: "Enroute DEL",
  at_receiver: "At Receiver",
  unloading: "Unloading",
  unloaded: "Unloaded",
  detention: "Detention",
  hos_break: "HOS Break",
  off_duty: "Off Duty",
  accident: "Accident",
  breakdown: "Breakdown",
  no_gps: "No GPS",
};

function lifecycleClass(lifecycle: DispatchLifecycleStage) {
  if (lifecycle === "accident" || lifecycle === "breakdown") return "border-red-500 bg-red-100 text-red-700";
  if (lifecycle === "no_gps" || lifecycle === "detention") return "border-amber-500 bg-amber-100 text-amber-700";
  return "border-blue-300 bg-blue-50 text-blue-700";
}

function etaClass(confidence?: DispatchConfidenceClass | null) {
  if (confidence === "on_time") return "text-green-700";
  if (confidence === "tight") return "text-amber-700";
  return "text-red-700";
}

export function DriverStatusCell({ lifecycle, etaConfidence, etaText, onClick }: Props) {
  return (
    <button type="button" className="flex flex-col items-start gap-0.5 text-left" onClick={onClick}>
      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${lifecycleClass(lifecycle)}`}>{lifecycleLabel[lifecycle]}</span>
      <span className={`text-[10px] font-semibold ${etaClass(etaConfidence)}`}>
        {etaText || (etaConfidence ? etaConfidence.replace("_", " ") : "manual ETA")}
      </span>
    </button>
  );
}
