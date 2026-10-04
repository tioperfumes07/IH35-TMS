export default {
  name: "verify:load-linkage-renders-both-directions",
  run(ctx) {
    ctx.run("node", ["scripts/verify-load-linkage-renders-both-directions.mjs"]);
  },
};
