import type { MouseEvent } from "react";

export function modalCloseAriaLabel(title: string): string {
  return `Close ${title}`;
}

type Props = {
  title: string;
  onClose: () => void;
  className?: string;
  stopPropagation?: boolean;
};

export function ModalCloseButton({ title, onClose, className, stopPropagation = true }: Props) {
  return (
    <button
      type="button"
      role="button"
      aria-label={modalCloseAriaLabel(title)}
      className={
        className ??
        "flex h-6 w-6 shrink-0 items-center justify-center rounded text-lg leading-none text-gray-500 hover:bg-gray-100 hover:text-gray-700"
      }
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        if (stopPropagation) {
          event.preventDefault();
          event.stopPropagation();
        }
        onClose();
      }}
    >
      ×
    </button>
  );
}
