export default {
  name: "verify:ap-aging-url-sort",
  run(ctx) {
    ctx.run("node", ["scripts/verify-ap-aging-url-sort.mjs"]);
  },
};
