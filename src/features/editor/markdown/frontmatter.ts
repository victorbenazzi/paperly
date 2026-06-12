import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

/**
 * Page metadata that markdown itself cannot represent. Lives as YAML
 * frontmatter at the top of the .md file (the Obsidian-compatible spot).
 */
export interface NoteMeta {
  icon?: string;
  cover?: string;
  created?: string;
  updated?: string;
  [key: string]: unknown;
}

export interface SplitNote {
  meta: NoteMeta;
  body: string;
}

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * Split YAML frontmatter from the body. BlockNote does not understand
 * frontmatter (the `---` would parse as a thematic break), so this MUST run
 * before markdownToBlocks. Unparseable YAML is preserved verbatim by treating
 * the whole file as body (never destroy user data).
 */
export function splitFrontmatter(text: string): SplitNote {
  const match = FM_RE.exec(text);
  if (!match) return { meta: {}, body: text };
  try {
    const parsed = parseYaml(match[1]);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { meta: {}, body: text };
    }
    // The blank line after the frontmatter block is formatting, not body.
    // Serializers never emit a leading newline, so leaving it here would make
    // every read differ from its own round-trip and re-save the file (with a
    // fresh `updated`) on every visit. joinFrontmatter writes it back on save.
    return {
      meta: parsed as NoteMeta,
      body: text.slice(match[0].length).replace(/^(?:\r?\n)+/, ""),
    };
  } catch {
    return { meta: {}, body: text };
  }
}

/** Re-attach frontmatter on save. Empty meta writes no frontmatter block. */
export function joinFrontmatter(meta: NoteMeta, body: string): string {
  const keys = Object.keys(meta).filter((k) => meta[k] !== undefined && meta[k] !== null);
  if (keys.length === 0) return body;
  const slim: Record<string, unknown> = {};
  for (const k of keys) slim[k] = meta[k];
  return `---\n${stringifyYaml(slim).trimEnd()}\n---\n\n${body.replace(/^(?:\r?\n)+/, "")}`;
}
