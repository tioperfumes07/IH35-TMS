import { createContext, useCallback, useContext, useId, useLayoutEffect, useSyncExternalStore } from "react";

/** Portals remain siblings in the DOM; React ancestry plus open order determines their layer. */
export const OverlayParent = createContext<string | null>(null);
type Layer = { id: string; parent: string | null; minimum: number };
let layers: Layer[] = [];
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const snapshot = () => layers;
function emit() { for (const listener of listeners) listener(); }
function ordered() {
  const result: Layer[] = [];
  const visit = (layer: Layer) => {
    if (result.includes(layer)) return;
    // Effects mount child-first: place its registered parent first even in that case.
    const parent = layers.find(candidate => candidate.id === layer.parent);
    if (parent) visit(parent);
    result.push(layer);
  };
  for (const layer of layers) visit(layer);
  return result;
}

export function useOverlayLayer(open: boolean, minimum = 1001) {
  const id = useId();
  const parent = useContext(OverlayParent);
  useSyncExternalStore(subscribe, snapshot, snapshot);
  useLayoutEffect(() => {
    if (!open) return;
    layers = [...layers, { id, parent, minimum }];
    emit();
    return () => { layers = layers.filter(layer => layer.id !== id); emit(); };
  }, [open, id, parent, minimum]);
  let zIndex = minimum;
  let prior = 999;
  for (const layer of ordered()) {
    prior = Math.max(prior + 2, layer.minimum);
    if (layer.id === id) zIndex = prior;
  }
  // Read at event time, not from a render closure: opening/closing another layer is synchronous.
  const isTop = useCallback(() => ordered().at(-1)?.id === id, [id]);
  return { id, zIndex, isTop };
}
