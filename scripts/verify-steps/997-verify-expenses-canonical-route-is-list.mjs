export default {
  name: "verify:expenses-canonical-route-is-list",
  run(ctx) {
    ctx.run("node", ["scripts/verify-expenses-canonical-route-is-list.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-expenses-canonical-route-is-list.mjs"]);
  },
};
