export default {
  name: "verify:ifta-filing-export-honest",
  run(ctx) {
    ctx.run("node", ["scripts/verify-ifta-filing-export-honest.mjs"]);
  },
};
