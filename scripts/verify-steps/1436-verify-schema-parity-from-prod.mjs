// SAF-F08 — schema-parity baseline is migration-parsed; held/unapplied columns must not false-PASS.
// Prod truth = docs/schema-parity-prod-evidence.json (information_schema / lucia snapshot).
export default {
  name: "verify-schema-parity-from-prod",
  run(ctx) {
    ctx.run("node", ["scripts/verify-schema-parity-from-prod.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-schema-parity-from-prod.mjs"]);
  },
};
