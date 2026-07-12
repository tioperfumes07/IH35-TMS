// 0243-d4-1 — samsara webhook unit-resolution regression guard. Fails if resolveLocalIds loses the
// mdata.units.samsara_vehicle_id PRIMARY lookup (units-primary -> equipment-fallback pattern).
import { run } from "../verify-samsara-webhook-unit-fallback.mjs";

export default {
  name: "samsara-webhook-unit-fallback",
  run: async () => {
    const r = run();
    if (!r.ok) throw new Error("samsara-webhook-unit-fallback FAIL:\n  " + r.offenders.map((x) => "✗ " + x).join("\n  "));
  },
};
