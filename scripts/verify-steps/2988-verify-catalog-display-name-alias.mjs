import { run } from "../../verify-catalog-display-name-alias.mjs";

export default {
  name: "verify-catalog-display-name-alias",
  async run(ctx) {
    const { ok, message } = run();
    if (!ok) {
      ctx.fail(message);
    } else {
      ctx.pass(message);
    }
  },
};
