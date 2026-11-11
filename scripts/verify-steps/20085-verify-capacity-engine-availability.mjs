export default {
  name: "verify:capacity-engine-availability",
  run(ctx) {
    ctx.run("node", ["scripts/verify-capacity-engine-availability.mjs"]);
    ctx.run("node", ["scripts/verify-capacity-engine-availability.mjs", "--selftest"]);
  },
};
