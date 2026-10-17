// LEAD 443.180 — a click anywhere on a row opens that row's record (QuickBooks), the transaction link first.
import { describe, expect, it, vi } from "vitest";
import { openParityRowPrimaryLink } from "./ParityTable";

function row(html: string) {
  const tr = document.createElement("tr");
  tr.innerHTML = html;
  document.body.appendChild(tr);
  return tr;
}

describe("openParityRowPrimaryLink", () => {
  it("opens the transaction link, not the customer link that comes first", () => {
    const tr = row('<td><a href="/customers/c1">ES Logistics</a></td><td class="cell">x</td><td><a href="/factoring/submit-invoice?edit_purchase_id=p1">FP-2026-00025</a></td>');
    const links = tr.querySelectorAll("a");
    const customer = vi.fn((e: Event) => e.preventDefault());
    const purchase = vi.fn((e: Event) => e.preventDefault());
    links[0]!.addEventListener("click", customer);
    links[1]!.addEventListener("click", purchase);
    expect(openParityRowPrimaryLink(tr, tr.querySelector(".cell"))).toBe(true);
    expect(purchase).toHaveBeenCalledTimes(1);
    expect(customer).not.toHaveBeenCalled();
  });

  it("falls back to the first link when the row only has master-data links", () => {
    const tr = row('<td><a href="/customers/c1">ES Logistics</a></td><td class="cell">x</td>');
    const customer = vi.fn((e: Event) => e.preventDefault());
    tr.querySelector("a")!.addEventListener("click", customer);
    expect(openParityRowPrimaryLink(tr, tr.querySelector(".cell"))).toBe(true);
    expect(customer).toHaveBeenCalledTimes(1);
  });

  it("leaves clicks on buttons and inputs alone, and does nothing on a row with no link", () => {
    const tr = row('<td><button>Edit</button></td><td><input type="checkbox" /></td><td><a href="/x">X</a></td>');
    expect(openParityRowPrimaryLink(tr, tr.querySelector("button"))).toBe(false);
    expect(openParityRowPrimaryLink(tr, tr.querySelector("input"))).toBe(false);
    const empty = row('<td class="cell">no link</td>');
    expect(openParityRowPrimaryLink(empty, empty.querySelector(".cell"))).toBe(false);
  });
});
