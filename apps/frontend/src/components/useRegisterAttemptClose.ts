import { useCallback, useEffect, useRef } from "react";

/**
 * Hands a parent ONE stable "attempt close" function (the guarded close a footer Cancel calls).
 *
 * Root cause it fixes (FinesPage, 11-16): Modal and ParityDrawer registered `attemptClose` in an effect keyed on the
 * parent's callback and on `attemptClose` itself. Callers pass an inline `(next) => setX(() => next)`, and
 * `attemptClose` changes whenever `onClose` does (a `useMutation` result in its deps changes every render). So every
 * render re-ran the effect, its cleanup set the parent's state to a fresh no-op, the parent re-rendered with a new
 * inline callback, and the cycle never ended — the Fines page's closed Create Fine drawer spun until the test worker
 * was killed at 6.6 GB.
 *
 * Now the parent receives a stable wrapper once per mount (and a no-op on unmount); the wrapper always calls the
 * latest `attemptClose`, so the guard still sees the current dirty state.
 */
export function useRegisterAttemptClose(
  onRegister: ((attemptClose: () => void) => void) | undefined,
  attemptClose: () => void,
): void {
  const latestAttempt = useRef(attemptClose);
  const latestRegister = useRef(onRegister);
  useEffect(() => {
    latestAttempt.current = attemptClose;
    latestRegister.current = onRegister;
  });
  const stableAttempt = useCallback(() => latestAttempt.current(), []);
  const hasRegister = Boolean(onRegister);
  useEffect(() => {
    if (!hasRegister) return;
    latestRegister.current?.(stableAttempt);
    return () => latestRegister.current?.(() => {});
  }, [hasRegister, stableAttempt]);
}
