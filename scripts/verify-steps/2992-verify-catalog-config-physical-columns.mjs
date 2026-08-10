import { run } from "../verify-catalog-config-physical-columns.mjs";

export default {
  name: "verify-catalog-config-physical-columns",
  async run(ctx) {
    const { ok, message } = run();
    if (!ok) {
      ctx.fail(message);
    } else {
      ctx.pass(message);
    }
  },
};
