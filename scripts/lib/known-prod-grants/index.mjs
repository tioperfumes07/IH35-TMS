import accounting from "./accounting.mjs";
import safety from "./safety.mjs";
import org from "./org.mjs";
import mdata from "./mdata.mjs";
import factor from "./factor.mjs";
import audit from "./audit.mjs";
import identity from "./identity.mjs";
import catalogs from "./catalogs.mjs";
import payroll from "./payroll.mjs";
import telematics from "./telematics.mjs";

export const KNOWN_PROD_TABLE_GRANTS = [
  ...accounting,
  ...safety,
  ...org,
  ...mdata,
  ...factor,
  ...audit,
  ...identity,
  ...catalogs,
  ...payroll,
  ...telematics,
];
