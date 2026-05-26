import { registerA } from "./maintenance/a.routes.js";
import { registerB } from "./maintenance/b.routes.js";
import { registerC } from "./maintenance/c.routes.js";

async function main(app: unknown) {
  await registerA(app);
  await registerB(app);
  await registerC(app);
}

void main({});
