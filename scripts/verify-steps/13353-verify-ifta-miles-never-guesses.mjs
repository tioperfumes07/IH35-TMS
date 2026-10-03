export default {
  name: "verify:ifta-miles-never-guesses",
  run(ctx) {
    ctx.run("node", ["scripts/verify-ifta-miles-never-guesses.mjs"]);
  },
};
