import { describe, expect, it } from "vitest";

import {
  extractCompatibleTitle,
  renameCompatibleTitleInFile,
  restoreCompatibleTitle,
} from "./titleProjection";

describe("compatible Markdown title", () => {
  it("hides a matching first H1 and restores its exact source", () => {
    const markdown = "# Home\n\nBody text.\n";
    const extracted = extractCompatibleTitle(markdown, "Home");

    expect(extracted.body).toBe("Body text.\n");
    expect(restoreCompatibleTitle(extracted.body, "Home", extracted.projection)).toBe(markdown);
  });

  it("updates the preserved H1 when the file is renamed", () => {
    const extracted = extractCompatibleTitle("# Home\n\nBody.\n", "Home");

    expect(restoreCompatibleTitle(extracted.body, "Start", extracted.projection)).toBe(
      "# Start\n\nBody.\n",
    );
  });

  it("keeps a different H1 in the editable body", () => {
    const markdown = "# Visible section\n\nBody.\n";
    const extracted = extractCompatibleTitle(markdown, "File name");

    expect(extracted).toEqual({ body: markdown, projection: null });
  });

  it("preserves a matching setext title", () => {
    const markdown = "Home\n====\n\nBody.\n";
    const extracted = extractCompatibleTitle(markdown, "Home");

    expect(extracted.body).toBe("Body.\n");
    expect(restoreCompatibleTitle(extracted.body, "Home", extracted.projection)).toBe(markdown);
  });

  it("updates a compatible title without normalizing frontmatter", () => {
    const source = "---\r\nicon: 📝\r\ncustom:  yes\r\n---\r\n\r\n# Old\r\n\r\nBody\r\n";
    expect(renameCompatibleTitleInFile(source, "Old", "New")).toBe(
      "---\r\nicon: 📝\r\ncustom:  yes\r\n---\r\n\r\n# New\r\n\r\nBody\r\n",
    );
  });
});
