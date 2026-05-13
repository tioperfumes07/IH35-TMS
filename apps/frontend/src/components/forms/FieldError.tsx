export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={`${id}-error`} className="mt-1 text-xs text-red-600">
      {message}
    </p>
  );
}

export function fieldErrorClassname(hasError: boolean, base: string): string {
  return hasError ? `${base} border-red-500 ring-1 ring-red-500` : `${base} border-slate-300`;
}
