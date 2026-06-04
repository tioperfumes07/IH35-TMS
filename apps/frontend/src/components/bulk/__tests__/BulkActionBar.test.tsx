import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BulkActionBar } from "../BulkActionBar";

vi.mock("../../../hooks/useBulkPermission", () => ({
  useBulkPermission: vi.fn(() => ({
    role: "Owner",
    canUseBulkOps: true,
    canRunDestructiveBulk: true,
    isActionAllowed: () => true,
  })),
}));

import { useBulkPermission } from "../../../hooks/useBulkPermission";

describe("BulkActionBar", () => {
  it("renders nothing when selectedCount is 0", () => {
    const { container } = render(
      <BulkActionBar selectedCount={0} actions={[]} onClear={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders actions and clear when items selected", () => {
    const onClear = vi.fn();
    const onAction = vi.fn();
    render(
      <BulkActionBar
        selectedCount={3}
        actions={[{ id: "archive", label: "Archive", onClick: onAction }]}
        onClear={onClear}
      />
    );
    expect(screen.getByText("3 selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    expect(onAction).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("renders null when bulk permission denies write role", () => {
    vi.mocked(useBulkPermission).mockReturnValueOnce({
      role: null,
      canUseBulkOps: false,
      canRunDestructiveBulk: false,
      isActionAllowed: () => false,
    });
    const { container } = render(
      <BulkActionBar
        selectedCount={2}
        actions={[{ id: "status", label: "Status", onClick: vi.fn() }]}
        onClear={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });
});
