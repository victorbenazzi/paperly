import { describe, expect, it } from "vitest";

import { joinFrontmatter, splitFrontmatter } from "./frontmatter";

describe("splitFrontmatter", () => {
  it("returns the whole text as body when there is no frontmatter", () => {
    const text = "# Title\n\nBody.";
    expect(splitFrontmatter(text)).toEqual({ meta: {}, body: text });
  });

  it("splits valid YAML frontmatter", () => {
    const text = "---\nicon: 🤖\ncover: assets/c.png\n---\n\n# Title\n";
    const { meta, body } = splitFrontmatter(text);
    expect(meta.icon).toBe("🤖");
    expect(meta.cover).toBe("assets/c.png");
    expect(body).toBe("\n# Title\n");
  });

  it("treats broken YAML as plain body (never destroys data)", () => {
    const text = "---\n: [unclosed\n---\nbody";
    expect(splitFrontmatter(text).body).toBe(text);
  });

  it("does not confuse a thematic break mid-document with frontmatter", () => {
    const text = "intro\n---\nnot frontmatter";
    expect(splitFrontmatter(text)).toEqual({ meta: {}, body: text });
  });
});

describe("joinFrontmatter", () => {
  it("writes no frontmatter block for empty meta", () => {
    expect(joinFrontmatter({}, "# T\n")).toBe("# T\n");
  });

  it("round-trips meta + body", () => {
    const joined = joinFrontmatter({ icon: "🌱" }, "# T\n\nbody\n");
    const { meta, body } = splitFrontmatter(joined);
    expect(meta.icon).toBe("🌱");
    expect(body.trimStart()).toBe("# T\n\nbody\n");
  });

  it("drops undefined keys", () => {
    const joined = joinFrontmatter({ icon: undefined, cover: "x.png" }, "b");
    expect(joined).not.toContain("icon");
    expect(joined).toContain("cover: x.png");
  });
});
