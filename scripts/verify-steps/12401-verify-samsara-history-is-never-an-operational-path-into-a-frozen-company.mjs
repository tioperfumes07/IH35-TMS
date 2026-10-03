// ROUND 380.3: Samsara telematics history is kept but is never an operational path into another company — every
// reader of telematics.vehicle_driver_assignments is classified, and every OPERATIONAL query carries a company pin.
// Import-safe static half; the live half (0 USMCA loads / fuel / postings on another company's driver) runs in the gate.
import { run } from "../verify-samsara-history-is-never-an-operational-path-into-a-frozen-company.mjs";

export default {
  name: "samsara-history-is-never-an-operational-path-into-a-frozen-company",
  run: async () => {
    const problems = run();
    if (problems.length) throw new Error("samsara-history-is-never-an-operational-path FAIL:\n  " + problems.join("\n  "));
  },
};
