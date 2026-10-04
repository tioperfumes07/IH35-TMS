export default {
  name: "verify:lists-fleet-subnav-complete",
  run(ctx) {
    ctx.run("node", ["scripts/verify-lists-fleet-subnav-complete.mjs"]);
  },
};
