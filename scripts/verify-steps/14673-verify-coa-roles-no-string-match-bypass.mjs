export default {
  name: "verify:coa-roles-no-string-match-bypass",
  run(ctx) {
    ctx.run("node", ["scripts/verify-coa-roles-no-string-match-bypass.mjs"]);
  },
};
