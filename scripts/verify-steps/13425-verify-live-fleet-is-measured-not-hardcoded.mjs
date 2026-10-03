export default {
  name: "verify:live-fleet-is-measured-not-hardcoded",
  run(ctx) {
    ctx.run("node", ["scripts/verify-live-fleet-is-measured-not-hardcoded.mjs"]);
  },
};
