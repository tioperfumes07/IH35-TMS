import { describe, expect, it } from "vitest";
import { bookLoadToastMessage, bookLoadToastTone } from "../book-load-toast";

/**
 * LV-DISPATCH-TOAST-LIES. The regression bar is the exact live case CC-3 proved on prod:
 * `Override & dispatch` on L-20260806-0008 returned `assigned_not_dispatched`, and the UI said
 * "Load booked and dispatched" in green.
 */
describe("bookLoadToastMessage", () => {
  it("THE DEFECT: a book_dispatch that came back assigned_not_dispatched must NOT claim dispatch", () => {
    const msg = bookLoadToastMessage("book_dispatch", "assigned_not_dispatched");
    expect(msg).not.toContain("and dispatched");
    expect(msg).toBe("Load booked — assigned, NOT dispatched");
  });

  it("and it must not render as an unqualified green success", () => {
    expect(bookLoadToastTone("book_dispatch", "assigned_not_dispatched")).toBe("info");
  });

  it("reports dispatch only when the server actually returned dispatched", () => {
    expect(bookLoadToastMessage("book_dispatch", "dispatched")).toBe("Load booked and dispatched");
    expect(bookLoadToastTone("book_dispatch", "dispatched")).toBe("success");
  });

  it("draft is unchanged", () => {
    expect(bookLoadToastMessage("draft", "draft")).toBe("Draft saved");
    expect(bookLoadToastTone("draft", "draft")).toBe("success");
  });

  it("claims nothing when the server returned no status", () => {
    for (const missing of [null, undefined, ""]) {
      const msg = bookLoadToastMessage("book_dispatch", missing);
      expect(msg).toBe("Load booked — status unconfirmed");
      expect(msg).not.toContain("and dispatched");
      expect(bookLoadToastTone("book_dispatch", missing)).toBe("info");
    }
  });

  it("shows an unmapped status verbatim rather than inventing a label", () => {
    expect(bookLoadToastMessage("book_dispatch", "some_future_status")).toBe("Load booked — some_future_status");
  });

  it("maps the other real statuses honestly", () => {
    expect(bookLoadToastMessage("book_dispatch", "cancelled")).toBe("Load booked — cancelled");
    expect(bookLoadToastMessage("book_dispatch", "in_transit")).toBe("Load booked — in transit");
  });
});
