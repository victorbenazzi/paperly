import { CMD, ipc } from "@/lib/ipc";
import { stripMdExt, isMarkdown } from "@/features/tree/tree.types";

/**
 * Wiki-link resolver: indexes all .md files in a vault by basename
 * (case-insensitive) and resolves `[[Note Name]]` to absolute paths.
 * Used by the codec to convert wiki-links to/from standard markdown links.
 *
 * Safety rules (the on-disk markdown is user data, never degrade it):
 * - unresolved `[[links]]` stay literal, they are NEVER rewritten to `(#)`
 * - resolved links expand to vault-RELATIVE hrefs, absolute machine paths
 *   must not leak into the files
 * - fenced code blocks are left untouched in both directions
 */

let basenameIndex: Map<string, string[]> = new Map();
let indexedVaultId: string | null = null;
let building: Promise<void> | null = null;

/**
 * Build (or reuse) the basename index. Await this before parsing a note, so
 * the first note opened can't race an empty index.
 */
export function ensureWikiIndex(vaultId: string): Promise<void> {
  if (indexedVaultId === vaultId && building) return building;
  indexedVaultId = vaultId;
  building = (async () => {
    try {
      const files = await ipc<string[]>(CMD.listFiles, { vaultId, max: 10000 });
      const idx = new Map<string, string[]>();
      for (const f of files) {
        const name = f.split("/").pop() ?? "";
        if (!isMarkdown(name)) continue;
        const base = stripMdExt(name).toLowerCase();
        idx.set(base, [...(idx.get(base) ?? []), f]);
      }
      basenameIndex = idx;
    } catch {
      // listing failed; reset so the next call retries instead of caching emptiness
      basenameIndex = new Map();
      indexedVaultId = null;
    }
  })();
  return building;
}

/** Drop and rebuild the index; called when the watcher reports .md changes. */
export function refreshWikiIndex(vaultId: string): void {
  indexedVaultId = null;
  building = null;
  void ensureWikiIndex(vaultId);
}

/**
 * Resolve a wiki-link target (the text inside [[...]]) to an absolute path.
 * Returns null if no match is found. Prefers exact case match, then
 * case-insensitive. If multiple files share the basename, returns the first.
 */
export function resolveWikiLink(target: string): string | null {
  const key = target.trim().toLowerCase();
  const candidates = basenameIndex.get(key);
  if (!candidates || candidates.length === 0) return null;
  const exact = candidates.find((c) => {
    const name = stripMdExt(c.split("/").pop() ?? "");
    return name === target.trim();
  });
  return exact ?? candidates[0];
}

const FENCE_RE = /^(```|~~~)/;

/** Apply `fn` line by line, skipping the inside of fenced code blocks. */
function mapNonCodeLines(body: string, fn: (line: string) => string): string {
  let inFence = false;
  return body
    .split("\n")
    .map((line) => {
      if (FENCE_RE.test(line.trimStart())) {
        inFence = !inFence;
        return line;
      }
      return inFence ? line : fn(line);
    })
    .join("\n");
}

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Convert wiki-links `[[Note Name]]` to standard links with vault-relative
 * hrefs (`[Note Name](sub/Note%20Name.md)`) before passing to BlockNote.
 * Unresolved links are left as literal text so the file never loses them.
 */
export function expandWikiLinks(body: string, vaultPath: string): string {
  return mapNonCodeLines(body, (line) =>
    line.replace(/\[\[([^[\]]+)\]\]/g, (match, target: string) => {
      const resolved = resolveWikiLink(target);
      if (!resolved) return match;
      const rel = resolved.startsWith(`${vaultPath}/`)
        ? resolved.slice(vaultPath.length + 1)
        : resolved;
      return `[${target}](${encodeURI(rel)})`;
    }),
  );
}

/**
 * Convert markdown links pointing at .md files inside the vault back to
 * wiki-links when the link text matches the basename. Links with custom text
 * keep the explicit form. Also undoes the serializer's escaping of literal
 * `[[...]]` text so unresolved wiki-links stay stable on disk.
 */
export function collapseWikiLinks(body: string, vaultPath: string): string {
  return mapNonCodeLines(body, (rawLine) => {
    const line = rawLine.replace(/\\\[\\\[([^[\]]+?)(?:\\\]\\\]|\]\])/g, "[[$1]]");
    return line.replace(
      /\[([^[\]]+)\]\(([^()\s]+\.(?:md|markdown))\)/gi,
      (match, text: string, rawHref: string) => {
        if (SCHEME_RE.test(rawHref)) return match;
        let href: string;
        try {
          href = decodeURI(rawHref);
        } catch {
          return match;
        }
        const abs = href.startsWith("/") ? href : `${vaultPath}/${href}`;
        if (!abs.startsWith(`${vaultPath}/`)) return match;
        const base = stripMdExt(abs.split("/").pop() ?? "");
        if (text.trim() !== base) return match;
        return `[[${text}]]`;
      },
    );
  });
}
