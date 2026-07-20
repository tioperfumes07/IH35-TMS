export default {
  name: "verify:active-driver-set-worker-registered",
  run(ctx) {
    ctx.run("node", ["scripts/verify-active-driver-set-worker-registered.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-active-driver-set-worker-registered.mjs"]);
  },
};
