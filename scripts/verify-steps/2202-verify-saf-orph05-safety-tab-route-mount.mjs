// 2202-verify-saf-orph05-safety-tab-route-mount — SAF-ORPH-05 layer A (Cursor EVEN band).
//
// Closes chrome/route mount: every SAFETY_GROUPS canonical /safety/* route is registered in
// manifest.tsx. Does NOT claim live TRANSP+USMCA DoD click-through (that remains UNVERIFIED).
const SCRIPT = "scripts/verify-saf-orph05-safety-tab-route-mount.mjs";

export default {
  name: "verify:saf-orph05-safety-tab-route-mount",
  async run(ctx) {
    await ctx.run("node", [SCRIPT, "--selftest"]);
    await ctx.run("node", [SCRIPT]);
  },
};
