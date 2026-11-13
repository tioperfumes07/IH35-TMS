#!/usr/bin/env node
/** verify-step 20159 — board11 one Stops + miles reader */
export default {
  name: "verify-driver-profile-stops-miles-once",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-profile-stops-miles-once.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-profile-stops-miles-once.mjs"]);
  },
};
