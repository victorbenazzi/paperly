// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

import { captureBlockDomSnapshot, findBlockElement, isDragHandle } from "./blocknoteDomAdapter";

describe("BlockNote DOM adapter", () => {
  it("captures guarded block geometry once per snapshot", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <div class="bn-block-outer" data-id="one"><div class="bn-block"></div></div>
      <div class="bn-block-outer" data-id="two"><div class="bn-block"></div></div>
    `;
    const rows = root.querySelectorAll<HTMLElement>(".bn-block");
    vi.spyOn(rows[0]!, "getBoundingClientRect").mockReturnValue({
      top: 10, bottom: 30, left: 20, right: 220, width: 200, height: 20, x: 20, y: 10,
      toJSON: () => ({}),
    });
    vi.spyOn(rows[1]!, "getBoundingClientRect").mockReturnValue({
      top: 40, bottom: 70, left: 20, right: 220, width: 200, height: 30, x: 20, y: 40,
      toJSON: () => ({}),
    });

    const snapshot = captureBlockDomSnapshot(root, (id) => id === "two");

    expect(snapshot.candidates).toEqual([{ id: "two", top: 40, bottom: 70 }]);
    expect(snapshot.bounds.get("two")).toEqual({ top: 40, bottom: 70, left: 20, right: 220 });
  });

  it("returns safe fallbacks when BlockNote internals are absent", () => {
    const root = document.createElement("div");
    expect(captureBlockDomSnapshot(root, () => true).candidates).toEqual([]);
    expect(findBlockElement(root, "missing")).toBeNull();
    expect(isDragHandle(null)).toBe(false);
  });

  it("captures a thousand block candidates without repeated DOM discovery", () => {
    const root = document.createElement("div");
    root.innerHTML = Array.from(
      { length: 1_000 },
      (_, index) =>
        `<div class="bn-block-outer" data-id="block-${index}"><div class="bn-block"></div></div>`,
    ).join("");
    const query = vi.spyOn(root, "querySelectorAll");

    const snapshot = captureBlockDomSnapshot(root, () => true);

    expect(snapshot.candidates).toHaveLength(1_000);
    expect(snapshot.bounds.size).toBe(1_000);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
