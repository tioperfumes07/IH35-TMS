import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, useNavigate } from "react-router-dom";
import { ScrollToTop } from "../ScrollToTop";

// UI-SCROLL-POSITION-NOT-RESET-ON-NAVIGATE: live-confirmed a real navigation (Link click) left the
// destination page scrolled to wherever the previous page was (scrollY=1122 instead of 0). ScrollToTop
// must reset to 0 on a genuine forward navigation (PUSH/REPLACE) and must NOT fight the browser's own
// back/forward scroll memory (POP) -- these tests cover both halves of that contract.

function PageA() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate("/b")}>
      go to b
    </button>
  );
}

function PageB() {
  return <div>page b</div>;
}

describe("ScrollToTop", () => {
  beforeEach(() => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("scrolls to top on a genuine forward navigation (PUSH)", async () => {
    const router = createMemoryRouter(
      [
        { path: "/a", element: <><ScrollToTop /><PageA /></> },
        { path: "/b", element: <><ScrollToTop /><PageB /></> },
      ],
      { initialEntries: ["/a"] },
    );
    const { getByText } = render(<RouterProvider router={router} />);

    (window.scrollTo as unknown as { mockClear: () => void }).mockClear();
    await act(async () => {
      getByText("go to b").click();
    });

    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("does not scroll on POP (browser back/forward)", async () => {
    const router = createMemoryRouter(
      [
        { path: "/a", element: <><ScrollToTop /><PageA /></> },
        { path: "/b", element: <><ScrollToTop /><PageB /></> },
      ],
      { initialEntries: ["/a", "/b"], initialIndex: 1 },
    );
    render(<RouterProvider router={router} />);

    (window.scrollTo as unknown as { mockClear: () => void }).mockClear();
    await act(async () => {
      router.navigate(-1);
    });

    expect(window.scrollTo).not.toHaveBeenCalled();
  });
});
