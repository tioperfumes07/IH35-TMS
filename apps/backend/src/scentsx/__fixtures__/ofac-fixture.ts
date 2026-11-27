/** A synthetic OFAC list in OFAC's own CSV layout for rolled-back tests (the loader refuses fewer than 1,000 names). */
export const FIXTURE_SDN = [
  `36,"AEROCARIBBEAN AIRLINES",-0- ,"CUBA",-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- `,
  `9001,"CARTEL DEL NORESTE, S.A. DE C.V.","-0-","SDNTK; ILLICIT-DRUGS-EO14059",-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,"Mexico."`,
  ...Array.from({ length: 1100 }, (_, i) => `${20000 + i},"ZZQX FILLER ${i} HOLDINGS",-0- ,"TEST",-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- `),
].join("\r\n");
export const FIXTURE_ALT = `9001,1,"aka","CDN PERFUMES Y FRAGANCIAS",-0- \r\n36,12,"aka","AERO-CARIBBEAN",-0- `;
export const fixtureFetcher = async (url: string) => (url.endsWith("SDN.CSV") ? FIXTURE_SDN : FIXTURE_ALT);
