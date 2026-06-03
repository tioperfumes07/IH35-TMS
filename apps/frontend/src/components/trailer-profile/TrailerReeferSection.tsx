/** A19 will replace this stub with live reefer-hours UI. */
export function TrailerReeferSection({ trailerId }: { trailerId: string }) {
  return (
    <section className="rounded border border-dashed border-amber-300 bg-amber-50 p-4" data-testid="tp-reefer-a19-slot">
      <h2 className="text-sm font-semibold text-amber-900">Reefer hours tracking</h2>
      <p className="mt-1 text-xs text-amber-800">Coming with A19. Trailer {trailerId.slice(0, 8)}…</p>
    </section>
  );
}
