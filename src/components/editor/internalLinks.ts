import { createExtension } from "@blocknote/core";
import { Plugin, PluginKey, type EditorState } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

import { isMarkdown } from "@/features/tree/tree.types";
import { usePageMetaStore } from "@/features/pages/pageMeta.store";

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const key = new PluginKey("paperly-internal-links");

/** href → absolute page path, mirroring NoteEditor's click resolution. */
function internalTarget(rawHref: string, vaultPath: string): string | null {
  if (!rawHref || rawHref === "#" || SCHEME_RE.test(rawHref)) return null;
  let href = rawHref;
  try {
    href = decodeURI(rawHref);
  } catch {
    // malformed encoding; judge the raw value
  }
  if (!isMarkdown(href.split("/").pop() ?? "")) return null;
  return href.startsWith("/") ? href : `${vaultPath}/${href}`;
}

/**
 * Notion-style page links. Inline decorations tag the text of in-vault .md
 * links with data-internal-link (the CSS draws the default page glyph) and
 * data-icon when the target page has an emoji icon in its frontmatter (read
 * through the page-meta cache the tree already uses).
 *
 * Decorations, not DOM patching: ProseMirror re-renders anchors from state
 * and strips foreign attributes, but decorations are its own and get
 * re-applied on every render.
 */
function buildDecorations(state: EditorState, vaultPath: string): DecorationSet {
  const { icons, request } = usePageMetaStore.getState();
  const decos: Decoration[] = [];
  state.doc.descendants((node, pos) => {
    if (!node.isText) return;
    const href = node.marks.find((m) => m.type.name === "link")?.attrs.href as
      | string
      | undefined;
    const target = href ? internalTarget(href, vaultPath) : null;
    if (!target) return;
    const icon = icons[target];
    // undefined = never loaded: kick off the fetch; the store subscription
    // below recomputes the decorations once it lands.
    if (icon === undefined) request(target);
    const attrs: Record<string, string> = { "data-internal-link": "" };
    if (icon) attrs["data-icon"] = icon;
    decos.push(Decoration.inline(pos, pos + node.nodeSize, attrs));
  });
  return DecorationSet.create(state.doc, decos);
}

export function internalLinkDecorations(vaultPath: string) {
  return createExtension({
    key: "internalLinkDecorations",
    prosemirrorPlugins: [
      new Plugin({
        key,
        props: {
          decorations: (state) => buildDecorations(state, vaultPath),
        },
        view: (view) => {
          // Icons land async in the page-meta cache; a meta-only transaction
          // re-runs the decorations without ever marking the doc changed.
          const unsub = usePageMetaStore.subscribe(() => {
            view.dispatch(view.state.tr.setMeta(key, true));
          });
          return { destroy: unsub };
        },
      }),
    ],
  });
}
