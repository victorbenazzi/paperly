// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";

import { createBlockDropIndicator, positionBlockDropIndicator } from "./blockDropIndicator";

afterEach(() => {
  document.body.replaceChildren();
});

describe("editor block drop indicator", () => {
  it("renders a visible fixed line at the requested block edge", () => {
    const indicator = createBlockDropIndicator(document);

    positionBlockDropIndicator(
      indicator,
      { top: 100, bottom: 130, left: 200, right: 600 },
      "after",
    );

    expect(document.body.contains(indicator)).toBe(true);
    expect(indicator.style.display).toBe("block");
    expect(indicator.style.top).toBe("130px");
    expect(indicator.style.left).toBe("172px");
    expect(indicator.style.width).toBe("428px");
    expect(indicator.style.height).toBe("1px");
    expect(indicator.style.opacity).toBe("0.55");
    expect(indicator.style.boxShadow).toBe("");
  });
});
