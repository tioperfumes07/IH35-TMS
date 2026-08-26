export default {
  name: "verify:safety-accident-workplace-incident-live-and-labels",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-accident-workplace-incident-live-and-labels.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-safety-accident-workplace-incident-live-and-labels.mjs"]);
  },
};
