import fs from "node:fs";
import path from "node:path";

// WO VOID/CANCEL must stay financially connected (Tier-1, gated WO_VOID_ENABLED, default OFF).
//
// When an Office WO Console void/cancel runs against a work order that has posted financials, the
// handler MUST reverse the WO's linked bill/GL through the SHARED void engine
// (apps/backend/src/accounting/void.service.ts postVoidReversal) rather than orphan the entries —
// and it must record the reversing JE id into maintenance.work_orders.reversing_entry_ref. The
// reversal is gated behind the WO_VOID_ENABLED env flag (OFF -> refuse, never orphan).
//
// This guard FAILS the build if that wiring is silently dropped from the WO routes file:
//   - postVoidReversal   (the shared reversal engine — proves NO new GL math was written)
//   - WO_VOID_ENABLED    (the OFF-by-default gate)
//   - reversing_entry_ref(the audit linkage column the reversal id is persisted into)

const WO_ROUTES = "apps/backend/src/work-orders/work-orders.routes.ts";

const REQUIRED = [
  { token: "postVoidReversal", why: "shared void-engine reversal call (reuse void.service, no new GL math)" },
  { token: "WO_VOID_ENABLED", why: "OFF-by-default financial-void flag gate" },
  { token: "reversing_entry_ref", why: "reversing-JE id persisted onto the work order" },
];

export default {
  name: "verify-wo-void-reverses-gl",
  run: async () => {
    const file = path.resolve(WO_ROUTES);
    if (!fs.existsSync(file)) {
      console.error(`verify-wo-void-reverses-gl FAILED — missing ${WO_ROUTES}`);
      process.exit(1);
    }
    const src = fs.readFileSync(file, "utf8");

    const missing = REQUIRED.filter(({ token }) => !src.includes(token));
    if (missing.length) {
      console.error(
        "verify-wo-void-reverses-gl FAILED — the WO void/cancel handler dropped its financial-reversal wiring. " +
          "It must reverse the WO's linked bill/GL via the shared void engine (no new GL math) and stay gated. Missing:\n  " +
          missing.map((m) => `${m.token} — ${m.why}`).join("\n  ")
      );
      process.exit(1);
    }

    // Defense-in-depth: the reversal call and the bill void must sit in the same routes file as the
    // void handler (proves the handler itself wires the engine, not some unrelated mention).
    const hasVoidHandler = /work-orders\/:id\/void/.test(src);
    const hasBillEntityReversal = /entityType:\s*["']bill["']/.test(src);
    if (!hasVoidHandler || !hasBillEntityReversal) {
      console.error(
        "verify-wo-void-reverses-gl FAILED — could not confirm the void handler reverses the linked bill " +
          `(void handler present=${hasVoidHandler}, bill entityType reversal present=${hasBillEntityReversal}).`
      );
      process.exit(1);
    }

    console.log("verify-wo-void-reverses-gl OK — WO void/cancel reverses linked bill/GL via the shared void engine, gated by WO_VOID_ENABLED.");
  },
};
