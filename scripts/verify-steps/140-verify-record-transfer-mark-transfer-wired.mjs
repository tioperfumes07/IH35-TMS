// 0441-mod8-mark-transfer-404-silent — RecordTransferModal must link bank<->bank feed rows.
import { run } from "../verify-record-transfer-mark-transfer-wired.mjs";
export default {
  name: "record-transfer-mark-transfer-wired",
  run: async () => {
    const f = run();
    if (f.length) throw new Error("record-transfer-mark-transfer-wired FAIL:\n  " + f.map((x) => "✗ " + x).join("\n  "));
  },
};
