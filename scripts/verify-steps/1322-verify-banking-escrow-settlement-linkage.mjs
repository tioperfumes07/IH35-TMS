import { run } from "../verify-banking-escrow-settlement-linkage.mjs";
import { runEscrowBoardRebuildChecks } from "../verify-settlements-escrow-board-rebuild.mjs";
export default {
  name: "banking-escrow-settlement-linkage",
  run: async () => {
    const failures = [...run(), ...runEscrowBoardRebuildChecks()];
    if (failures.length) throw new Error(failures.join("\n"));
  },
};
