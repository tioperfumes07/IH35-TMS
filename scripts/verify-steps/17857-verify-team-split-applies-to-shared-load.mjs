export default {
  name: "verify:team-split-applies-to-shared-load",
  run(ctx) {
    ctx.run("node", ["scripts/verify-team-split-applies-to-shared-load.mjs"]);
  },
};
