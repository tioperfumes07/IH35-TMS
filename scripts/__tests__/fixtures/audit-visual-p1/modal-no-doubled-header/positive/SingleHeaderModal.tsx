export function SingleHeaderModal() {
  return (
    <Modal open title="Work Order Details" onClose={() => undefined}>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Summary</div>
      <p>Body</p>
    </Modal>
  );
}
