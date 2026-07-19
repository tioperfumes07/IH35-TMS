export default {
  name: "verify:prepaid-fixedassets-url-sort",
  run(ctx) {
    ctx.run("node", ["scripts/verify-prepaid-fixedassets-url-sort.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-prepaid-fixedassets-url-sort.mjs"]);
  },
};
