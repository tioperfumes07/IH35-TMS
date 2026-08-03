export default {
  name: "verify:precommit-no-undefined-steps",
  run(ctx) {
    ctx.run("node", ["scripts/verify-precommit-no-undefined-steps.mjs"]);
  },
};
