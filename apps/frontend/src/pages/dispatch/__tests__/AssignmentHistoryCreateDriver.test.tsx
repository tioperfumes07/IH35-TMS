import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssignmentHistoryPage } from '../AssignmentHistoryPage';

const state = vi.hoisted(() => ({
  company: '5c854333-6ea5-4faa-af31-67cb272fef80',
  createdId: '00000000-0000-4000-8000-000000000003',
  list: vi.fn(async () => ({ rows: [], total_count: 0 })),
}));
vi.mock('../../../contexts/CompanyContext', () => ({ useCompanyContext: () => ({ selectedCompanyId: state.company }) }));
vi.mock('../../../api/dispatch', () => ({ listDispatchAssignmentHistory: state.list }));
vi.mock('../../../hooks/useSettlementReferences', () => ({ useSettlementReferences: () => new Map() }));
// Mock only the reusable selection/creation boundary: callbacks exercise the page's real state.
// No create API or production write is used by these tests.
vi.mock('../../../components/EntityMultiSelect', () => ({ EntityMultiSelect: ({ value, onChange }: { value: string | null; onChange: (id: string) => void }) =>
  <input aria-label="Selected drivers" value={value ?? ''} onChange={event => onChange(event.target.value)} /> }));
vi.mock('../../../components/drivers/CreateDriverModal', () => ({ CreateDriverModal: ({ open, companyId, onClose, onCreated }: { open: boolean; companyId: string; onClose: () => void; onCreated: (id: string, name: string) => void }) => open ?
  <div role="dialog" aria-label="Canonical driver creator" data-company={companyId}>
    <button onClick={onClose}>Cancel creation</button>
    <button onClick={() => onCreated(state.createdId, 'Fixture Driver')}>Return created driver</button>
  </div> : null }));

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  render(<QueryClientProvider client={client}><MemoryRouter><AssignmentHistoryPage /></MemoryRouter></QueryClientProvider>);
  return { invalidate };
}
afterEach(() => { cleanup(); state.list.mockClear(); state.createdId = '00000000-0000-4000-8000-000000000003'; });

describe('Assignment History preserves canonical driver creation beside multi-filter', () => {
  it('opens with selected company and cancels without changing draft or applied filters', () => {
    const { invalidate } = setup();
    fireEvent.change(screen.getByLabelText('Selected drivers'), { target: { value: 'driver-a,driver-b' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Create Driver' }));
    expect(screen.getByRole('dialog').getAttribute('data-company')).toBe(state.company);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel creation' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect((screen.getByLabelText('Selected drivers') as HTMLInputElement).value).toBe('driver-a,driver-b');
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('keeps both selected IDs, appends created ID, refreshes scoped roster, then applies all three', async () => {
    const { invalidate } = setup();
    const selected = '00000000-0000-4000-8000-000000000001,00000000-0000-4000-8000-000000000002';
    fireEvent.change(screen.getByLabelText('Selected drivers'), { target: { value: selected } });
    fireEvent.click(screen.getByRole('button', { name: '+ Create Driver' }));
    fireEvent.click(screen.getByRole('button', { name: 'Return created driver' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect((screen.getByLabelText('Selected drivers') as HTMLInputElement).value).toBe(`${selected},${state.createdId}`);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['entity-multi-select', state.company, 'driver'] });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(state.list).toHaveBeenLastCalledWith(state.company, expect.objectContaining({ driver_id: `${selected},${state.createdId}` })));
  });

  it('deduplicates an already selected created ID', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Selected drivers'), { target: { value: state.createdId } });
    fireEvent.click(screen.getByRole('button', { name: '+ Create Driver' }));
    fireEvent.click(screen.getByRole('button', { name: 'Return created driver' }));
    expect((screen.getByLabelText('Selected drivers') as HTMLInputElement).value).toBe(state.createdId);
  });

  it('does not drop existing selection or exceed the 100-ID filter limit', () => {
    setup();
    const selected = Array.from({ length: 100 }, (_, n) => `00000000-0000-4000-8000-${String(n + 100).padStart(12, '0')}`).join(',');
    fireEvent.change(screen.getByLabelText('Selected drivers'), { target: { value: selected } });
    fireEvent.click(screen.getByRole('button', { name: '+ Create Driver' }));
    fireEvent.click(screen.getByRole('button', { name: 'Return created driver' }));
    expect((screen.getByLabelText('Selected drivers') as HTMLInputElement).value).toBe(selected);
  });
});
