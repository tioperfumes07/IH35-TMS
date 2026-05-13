import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useEscapeKey } from "../useEscapeKey";

function Harness({ enabled, handler }: { enabled: boolean; handler: () => void }) {
  useEscapeKey(handler, enabled);
  return null;
}

describe("useEscapeKey", () => {
  it("fires handler on Escape when enabled", () => {
    const handler = vi.fn();
    render(<Harness enabled handler={handler} />);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does not fire when disabled", () => {
    const handler = vi.fn();
    render(<Harness enabled={false} handler={handler} />);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(handler).not.toHaveBeenCalled();
  });

  it("removes listener on unmount", () => {
    const handler = vi.fn();
    const { unmount } = render(<Harness enabled handler={handler} />);
    unmount();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(handler).not.toHaveBeenCalled();
  });
});
