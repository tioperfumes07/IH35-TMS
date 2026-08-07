// CLS-DISP-WIRE-08 — load status drives the driver settlement window; both team drivers must settle
// (verify-step 2509 · CC-1 lane = n%4==1).
export default {
  name: "disp-wire-08-settlement-ping",
  run(ctx) {
    ctx.run("node", ["scripts/verify-disp-wire-08-settlement-ping.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-disp-wire-08-settlement-ping.mjs"]);
  },
};
