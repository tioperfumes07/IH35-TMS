// SET-01 — FIN-18 deprecated settlement poster must not be a live money mount.
import { run } from "../verify-no-deprecated-settlement-poster-mounted.mjs";

export default {
  name: "no-deprecated-settlement-poster-mounted",
  run: async (ctx) => {
    ctx.run("node", ["scripts/verify-no-deprecated-settlement-poster-mounted.mjs"]);
    ctx.run("node", ["scripts/verify-no-deprecated-settlement-poster-mounted.mjs", "--selftest"]);
  },
};
