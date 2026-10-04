export default {
  name: "verify:bank-undo-releases-every-match-column",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bank-undo-releases-every-match-column.mjs"]);
  },
};
