// verify-steps wrapper — LV-DOC-CATEGORIES-MISSING-IDENTITY-AND-MX-LICENCE · claim 3616
export default {
  name: "verify-doc-categories-identity-mx-license",
  run(ctx) {
    ctx.run("node", ["scripts/verify-doc-categories-identity-mx-license.mjs"]);
  },
};
