export default {
  name: "verify:categorized-has-a-document",
  run(ctx) {
    ctx.run("node", ["scripts/verify-categorized-has-a-document.mjs"]);
  },
};
