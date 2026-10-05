import { describe, expect, it } from "vitest";
import { humanizeSegment, structuralCrumbsForPath, structuralParentHref } from "../structuralBreadcrumb";

describe("structuralBreadcrumb (ROUND 367.9)", () => {
  it("skips Accounting (CC-2 shell owns that breadcrumb)", () => {
    expect(structuralCrumbsForPath("/accounting")).toBeNull();
    expect(structuralCrumbsForPath("/accounting/bills")).toBeNull();
  });

  it("skips auth and public surfaces", () => {
    expect(structuralCrumbsForPath("/login")).toBeNull();
    expect(structuralCrumbsForPath("/legal/privacy")).toBeNull();
  });

  it("module home is a single crumb", () => {
    expect(structuralCrumbsForPath("/maintenance")).toEqual([{ label: "Maintenance" }]);
    expect(structuralCrumbsForPath("/dispatch")).toEqual([{ label: "Dispatch" }]);
  });

  it("list is Module › List", () => {
    expect(structuralCrumbsForPath("/maintenance/defects")).toEqual([
      { label: "Maintenance", href: "/maintenance" },
      { label: "Defects" },
    ]);
  });

  it("record is Module › List › Record", () => {
    const crumbs = structuralCrumbsForPath("/maintenance/defects/abc-123");
    expect(crumbs).toEqual([
      { label: "Maintenance", href: "/maintenance" },
      { label: "Defects", href: "/maintenance/defects" },
      { label: "Abc 123" },
    ]);
  });

  it("uuid segments become Detail", () => {
    expect(humanizeSegment("5c854333-6ea5-4faa-af31-67cb272fef80")).toBe("Detail");
  });

  it("structural parent is always the list for a record (never history)", () => {
    expect(structuralParentHref("/maintenance/defects/abc")).toBe("/maintenance/defects");
    expect(structuralParentHref("/dispatch/loads/13561")).toBe("/dispatch/loads");
    expect(structuralParentHref("/safety/idvr/xyz")).toBe("/safety/idvr");
  });

  it("identical breadcrumb from two arrival paths (deep link == in-app)", () => {
    const a = structuralCrumbsForPath("/customers/detail/1");
    const b = structuralCrumbsForPath("/customers/detail/1");
    expect(a).toEqual(b);
    expect(a?.[0]?.href).toBe("/customers");
  });
});
