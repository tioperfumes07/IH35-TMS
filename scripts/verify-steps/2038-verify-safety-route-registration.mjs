// SAF-F27 — SafetyLayout child routes: relative-only registration (verify-step 2038, Cursor EVEN band).
const SCRIPT = "scripts/verify-safety-route-registration.mjs";

export default {
  name: "verify:safety-route-registration",
  run(ctx) {
    ctx.run("node", [SCRIPT, "--selftest"]);
    ctx.run("node", [SCRIPT]);
  },
};
