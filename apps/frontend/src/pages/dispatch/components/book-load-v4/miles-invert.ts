/** MILES-INVERT-01 — detect catalog column inversion (short > practical). */
export function isMilesColumnInverted(practical: number, shortest: number): boolean {
  return practical > 0 && shortest > 0 && shortest > practical;
}
