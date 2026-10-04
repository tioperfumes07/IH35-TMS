export default {
  name: "verify:mdata-deactivate-rls-bypass-wrap",
  run(ctx) {
    ctx.run("node", ["scripts/verify-mdata-deactivate-rls-bypass-wrap.mjs"]);
  },
};
