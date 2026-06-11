import type { DirEntry } from "@/lib/ipc";

export type TreeNodeKind = "note" | "folder" | "folderNote" | "image" | "file";

export interface TreeNode {
  kind: TreeNodeKind;
  /** Display name (notes lose the .md extension). */
  name: string;
  /**
   * Primary path: the .md file for note/folderNote, the directory for folder,
   * the file itself otherwise.
   */
  path: string;
  /** Companion folder for folderNote, or the folder itself for folder nodes. */
  dirPath: string | null;
}

export const IMAGE_EXTS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif",
]);

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i + 1).toLowerCase();
}

export function isMarkdown(name: string): boolean {
  const e = extOf(name);
  return e === "md" || e === "markdown";
}

export function stripMdExt(name: string): string {
  return name.replace(/\.(md|markdown)$/i, "");
}

/**
 * Merge a directory listing into presentation nodes, Notion-style:
 * `X.md` next to a folder `X/` collapses into ONE expandable page node
 * (folderNote). The disk keeps both entries; only the tree view merges them.
 */
export function buildNodes(entries: DirEntry[]): TreeNode[] {
  const dirsByName = new Map<string, DirEntry>();
  for (const e of entries) {
    if (e.isDir) dirsByName.set(e.name, e);
  }
  const claimedDirs = new Set<string>();
  const nodes: TreeNode[] = [];

  for (const e of entries) {
    if (e.isDir) continue;
    if (isMarkdown(e.name)) {
      const base = stripMdExt(e.name);
      const companion = dirsByName.get(base);
      if (companion) {
        claimedDirs.add(companion.name);
        nodes.push({
          kind: "folderNote",
          name: base,
          path: e.path,
          dirPath: companion.path,
        });
      } else {
        nodes.push({ kind: "note", name: base, path: e.path, dirPath: null });
      }
    } else if (IMAGE_EXTS.has(extOf(e.name))) {
      nodes.push({ kind: "image", name: e.name, path: e.path, dirPath: null });
    } else {
      nodes.push({ kind: "file", name: e.name, path: e.path, dirPath: null });
    }
  }

  for (const e of entries) {
    if (!e.isDir || claimedDirs.has(e.name)) continue;
    nodes.push({ kind: "folder", name: e.name, path: e.path, dirPath: e.path });
  }

  // Pages first (notes + folder notes), then plain folders, then assets;
  // alphabetical inside each group.
  const rank = (n: TreeNode) =>
    n.kind === "note" || n.kind === "folderNote" ? 0 : n.kind === "folder" ? 1 : 2;
  nodes.sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });
  return nodes;
}
