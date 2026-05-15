type Props = {
  onPointerDrag: (dx: number, dy: number) => void;
  onPointerDone?: () => void;
};

/** Bottom-right resize grip — pointer capture for smooth dragging. */
export function ResizeHandle({ onPointerDrag, onPointerDone }: Props) {
  return (
    <div
      aria-hidden
      className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize rounded-br-lg bg-gray-200/90 hover:bg-gray-300"
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        (event.target as HTMLElement).setPointerCapture(event.pointerId);
        let lastX = event.clientX;
        let lastY = event.clientY;
        const onMove = (ev: PointerEvent) => {
          const dx = ev.clientX - lastX;
          const dy = ev.clientY - lastY;
          lastX = ev.clientX;
          lastY = ev.clientY;
          onPointerDrag(dx, dy);
        };
        const onUp = (ev: PointerEvent) => {
          (event.target as HTMLElement).releasePointerCapture(ev.pointerId);
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          onPointerDone?.();
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      }}
    />
  );
}
