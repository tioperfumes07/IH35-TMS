export default {
  name: "verify:posting-prepaid-factoring-register-human-labels",
  run(ctx) {
    ctx.run("node", ["scripts/verify-posting-prepaid-factoring-register-human-labels.mjs"]);
  },
};
