import { run } from "../verify-migration-claimed-on-main.mjs";

export default {
  name: "verify-migration-claimed-on-main",
  async run(ctx) {
    const { ok, message } = run();
    if (!ok) {
      ctx.fail(message);
    } else {
      ctx.pass(message);
    }
  },
};
