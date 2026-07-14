import { editorHasBlockWithType, type Block, type BlockNoteEditor } from "@blocknote/core";
import { SideMenuExtension } from "@blocknote/core/extensions";
import {
  AddBlockButton,
  blockTypeSelectItems,
  DragHandleMenu,
  SideMenuController,
  useBlockNoteEditor,
  useComponentsContext,
  useExtension,
  useExtensionState,
} from "@blocknote/react";
import { Copy, GripVertical, Replace, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, type ComponentType, type HTMLAttributes } from "react";
import { useTranslation } from "react-i18next";

import {
  createBlockDropIndicator,
  hideBlockDropIndicator,
  positionBlockDropIndicator,
} from "./blockDropIndicator";
import {
  captureBlockDomSnapshot,
  findBlockElement,
  isDragHandle,
  type BlockDomSnapshot,
} from "./blocknoteDomAdapter";
import { canReorderBlock, reorderBlock, resolveVerticalDropTarget, type BlockDropPlacement } from "./blockReorder";
import {
  canTurnMenuBlocksInto,
  duplicateMenuBlocks,
  removeMenuBlocks,
  turnMenuBlocksInto,
} from "./blockMenuActions";

const DRAG_THRESHOLD_PX = 4;
const SCROLL_EDGE_PX = 48;
const SCROLL_STEP_PX = 12;

type ActiveDrop = {
  id: string;
  placement: BlockDropPlacement;
};

function TurnIntoBlockItem({ block }: { block: Block<any, any, any> }) {
  const { t } = useTranslation();
  const editor = useBlockNoteEditor<any, any, any>();
  const Components = useComponentsContext()!;

  const items = useMemo(
    () =>
      blockTypeSelectItems(editor.dictionary).filter((item) =>
        editorHasBlockWithType(
          editor,
          item.type,
          Object.fromEntries(
            Object.entries(item.props ?? {}).map(([name, value]) => [name, typeof value]),
          ) as Record<string, "string" | "number" | "boolean">,
        ),
      ),
    [editor],
  );

  if (!canTurnMenuBlocksInto(editor, block) || items.length === 0) return null;

  return (
    <Components.Generic.Menu.Root position="right" sub={true}>
      <Components.Generic.Menu.Trigger sub={true}>
        <Components.Generic.Menu.Item
          className="bn-menu-item"
          icon={<Replace size={16} />}
          subTrigger={true}
        >
          {t("editor.blockActions.turnInto")}
        </Components.Generic.Menu.Item>
      </Components.Generic.Menu.Trigger>
      <Components.Generic.Menu.Dropdown
        className="bn-menu-dropdown bn-turn-into-menu"
        sub={true}
      >
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Components.Generic.Menu.Item
              className="bn-menu-item"
              icon={<Icon size={16} />}
              key={`${item.type}:${JSON.stringify(item.props ?? {})}`}
              onClick={() => turnMenuBlocksInto(editor, block, item)}
            >
              {item.name}
            </Components.Generic.Menu.Item>
          );
        })}
      </Components.Generic.Menu.Dropdown>
    </Components.Generic.Menu.Root>
  );
}

function BlockActionsMenu({ block }: { block: Block<any, any, any> }) {
  const { t } = useTranslation();
  const editor = useBlockNoteEditor<any, any, any>();
  const Components = useComponentsContext()!;
  const showTurnInto = canTurnMenuBlocksInto(editor, block);

  return (
    <DragHandleMenu>
      {showTurnInto && (
        <>
          <TurnIntoBlockItem block={block} />
          <Components.Generic.Menu.Divider />
        </>
      )}
      <Components.Generic.Menu.Item
        className="bn-menu-item"
        icon={<Copy size={16} />}
        onClick={() => duplicateMenuBlocks(editor, block)}
      >
        {t("editor.blockActions.duplicate")}
      </Components.Generic.Menu.Item>
      <Components.Generic.Menu.Item
        className="bn-menu-item bn-block-menu-delete"
        icon={<Trash2 size={16} />}
        onClick={() => removeMenuBlocks(editor, block)}
      >
        {t("editor.blockActions.delete")}
      </Components.Generic.Menu.Item>
    </DragHandleMenu>
  );
}

function sideMenuDataAttributes(
  editor: BlockNoteEditor,
  block: Block<any, any, any>,
): Record<string, string> {
  const attrs: Record<string, string> = { "data-block-type": block.type };
  if (block.type === "heading") attrs["data-level"] = String(block.props.level);

  const specs = editor.schema.blockSpecs as unknown as Record<
    string,
    { implementation: { meta?: { fileBlockAccept?: unknown } } }
  >;
  if (specs[block.type].implementation.meta?.fileBlockAccept) {
    attrs["data-url"] = "url" in block.props && block.props.url ? "true" : "false";
  }
  return attrs;
}

function PointerDragHandleButton({ block }: { block: Block<any, any, any> }) {
  const { t } = useTranslation();
  const Components = useComponentsContext()!;
  const sideMenu = useExtension(SideMenuExtension);

  return (
    <Components.Generic.Menu.Root
      position="left"
      onOpenChange={(open) => {
        if (open) sideMenu.freezeMenu();
        else sideMenu.unfreezeMenu();
      }}
    >
      <Components.Generic.Menu.Trigger>
        <Components.SideMenu.Button
          className="bn-button bn-block-drag-handle"
          label={t("editor.blockMenu")}
          icon={<GripVertical size={24} />}
        />
      </Components.Generic.Menu.Trigger>
      <BlockActionsMenu block={block} />
    </Components.Generic.Menu.Root>
  );
}

/**
 * BlockNote's native drag starts inside a composed menu trigger. WKWebView can
 * cancel that HTML drag before BlockNote receives it, so the visible handle
 * uses Pointer Events and commits through BlockNote's public block API.
 */
function PointerReorderSideMenu() {
  const editor = useBlockNoteEditor();
  const Components = useComponentsContext()!;
  const sideMenu = useExtension(SideMenuExtension, { editor });
  const block = useExtensionState(SideMenuExtension, {
    editor,
    selector: (state) => state?.block,
  });
  const cleanupRef = useRef<() => void>(() => {});
  const suppressClickRef = useRef(false);

  useEffect(() => () => cleanupRef.current(), []);

  const dataAttributes = useMemo(() => {
    if (!block) return {};
    return sideMenuDataAttributes(editor, block);
  }, [block, editor.schema.blockSpecs]);

  const onPointerDownCapture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!block || event.button !== 0 || !isDragHandle(event.target)) return;
      if ((event.nativeEvent as PointerEvent & { fakeEvent?: boolean }).fakeEvent) return;

      cleanupRef.current();
      const pointerId = event.pointerId;
      const startX = event.clientX;
      const startY = event.clientY;
      let started = false;
      let sourceElement: HTMLElement | null = null;
      let activeDrop: ActiveDrop | null = null;
      let dropIndicator: HTMLElement | null = null;
      let snapshot: BlockDomSnapshot = { candidates: [], bounds: new Map() };
      let latestPointerY = startY;
      let frameId = 0;
      let ending = false;
      let resizeObserver: ResizeObserver | null = null;
      let mutationObserver: MutationObserver | null = null;

      const refreshSnapshot = () => {
        const editorRoot = editor.domElement;
        snapshot = editorRoot
          ? captureBlockDomSnapshot(editorRoot, (id) => canReorderBlock(editor, block.id, id))
          : { candidates: [], bounds: new Map() };
      };

      const clearDrop = () => {
        activeDrop = null;
        hideBlockDropIndicator(dropIndicator);
      };

      const cleanup = () => {
        ending = true;
        resizeObserver?.disconnect();
        mutationObserver?.disconnect();
        resizeObserver = null;
        mutationObserver = null;
        if (frameId !== 0) cancelAnimationFrame(frameId);
        frameId = 0;
        clearDrop();
        dropIndicator?.remove();
        dropIndicator = null;
        sourceElement?.removeAttribute("data-editor-drag-source");
        document.body.removeAttribute("data-editor-block-dragging");
        if (started) sideMenu.unfreezeMenu();
        window.removeEventListener("pointermove", onPointerMove, true);
        window.removeEventListener("pointerup", onPointerUp, true);
        window.removeEventListener("pointercancel", onPointerCancel, true);
        cleanupRef.current = () => {};
      };

      const processPointer = () => {
        frameId = 0;
        clearDrop();

        const drop = resolveVerticalDropTarget(snapshot.candidates, latestPointerY);
        const bounds = drop ? snapshot.bounds.get(drop.id) : null;
        if (drop && bounds) {
          if (!dropIndicator) dropIndicator = createBlockDropIndicator(document);
          positionBlockDropIndicator(dropIndicator, bounds, drop.placement);
          activeDrop = { id: drop.id, placement: drop.placement };
        }

        const scrollRoot = editor.domElement?.closest<HTMLElement>("[data-scroll-root]");
        if (!scrollRoot) return;
        const rect = scrollRoot.getBoundingClientRect();
        const previousScrollTop = scrollRoot.scrollTop;
        if (latestPointerY < rect.top + SCROLL_EDGE_PX) scrollRoot.scrollTop -= SCROLL_STEP_PX;
        if (latestPointerY > rect.bottom - SCROLL_EDGE_PX) scrollRoot.scrollTop += SCROLL_STEP_PX;
        if (!ending && scrollRoot.scrollTop !== previousScrollTop) {
          refreshSnapshot();
          frameId = requestAnimationFrame(processPointer);
        }
      };

      const refreshAfterLayoutChange = () => {
        if (!started || ending) return;
        refreshSnapshot();
        if (frameId === 0) frameId = requestAnimationFrame(processPointer);
      };

      const observeLayoutChanges = () => {
        const editorRoot = editor.domElement;
        if (!editorRoot) return;

        if (typeof ResizeObserver !== "undefined") {
          resizeObserver = new ResizeObserver(refreshAfterLayoutChange);
          resizeObserver.observe(editorRoot);
        }
        if (typeof MutationObserver !== "undefined") {
          mutationObserver = new MutationObserver(refreshAfterLayoutChange);
          mutationObserver.observe(editorRoot, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["class", "style", "data-id"],
          });
        }
      };

      const onPointerMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) return;

        if (!started) {
          const distance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
          if (distance < DRAG_THRESHOLD_PX) return;
          started = true;
          suppressClickRef.current = true;
          sideMenu.freezeMenu();
          document.body.setAttribute("data-editor-block-dragging", "");
          dropIndicator = createBlockDropIndicator(document);
          sourceElement = editor.domElement
            ? findBlockElement(editor.domElement, block.id)
            : null;
          sourceElement?.setAttribute("data-editor-drag-source", "");
          refreshSnapshot();
          observeLayoutChanges();
        }

        moveEvent.preventDefault();
        latestPointerY = moveEvent.clientY;
        if (frameId === 0) frameId = requestAnimationFrame(processPointer);
      };

      const onPointerUp = (upEvent: PointerEvent) => {
        if (upEvent.pointerId !== pointerId) return;
        ending = true;
        if (frameId !== 0) {
          cancelAnimationFrame(frameId);
          frameId = 0;
          processPointer();
        }
        const drop = activeDrop;
        if (started) upEvent.preventDefault();
        cleanup();
        if (started && drop) reorderBlock(editor, block.id, drop.id, drop.placement);
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
      };

      const onPointerCancel = (cancelEvent: PointerEvent) => {
        if (cancelEvent.pointerId !== pointerId) return;
        cleanup();
        suppressClickRef.current = false;
      };

      cleanupRef.current = cleanup;
      window.addEventListener("pointermove", onPointerMove, true);
      window.addEventListener("pointerup", onPointerUp, true);
      window.addEventListener("pointercancel", onPointerCancel, true);
    },
    [block, editor, sideMenu],
  );

  const Root = Components.SideMenu.Root as ComponentType<HTMLAttributes<HTMLDivElement>>;

  return (
    <Root
      className="bn-side-menu"
      {...dataAttributes}
      onPointerDownCapture={onPointerDownCapture}
      onDragStartCapture={(event) => {
        if (!isDragHandle(event.target)) return;
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerUpCapture={(event) => {
        if (!suppressClickRef.current || !isDragHandle(event.target)) return;
        event.preventDefault();
        event.stopPropagation();
      }}
      onClickCapture={(event) => {
        if (!suppressClickRef.current || !isDragHandle(event.target)) return;
        event.preventDefault();
        event.stopPropagation();
        suppressClickRef.current = false;
      }}
    >
      <AddBlockButton />
      {block && <PointerDragHandleButton block={block} />}
    </Root>
  );
}

export function EditorSideMenu() {
  return <SideMenuController sideMenu={PointerReorderSideMenu} />;
}
