export default {
  name: "verify:safety-complete-driver-roster-vertical",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-complete-driver-roster-vertical.mjs"]);
  },
};
