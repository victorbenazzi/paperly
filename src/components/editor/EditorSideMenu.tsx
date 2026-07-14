import type { Block, BlockNoteEditor } from "@blocknote/core";
import { SideMenuExtension } from "@blocknote/core/extensions";
import {
  AddBlockButton,
  DragHandleMenu,
  SideMenuController,
  useBlockNoteEditor,
  useComponentsContext,
  useExtension,
  useExtensionState,
} from "@blocknote/react";
import { GripVertical } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, type ComponentType, type HTMLAttributes } from "react";
import { useTranslation } from "react-i18next";

import {
  createBlockDropIndicator,
  hideBlockDropIndicator,
  positionBlockDropIndicator,
  type BlockDropIndicatorBounds,
} from "./blockDropIndicator";
import { canReorderBlock, reorderBlock, resolveVerticalDropTarget, type BlockDropPlacement } from "./blockReorder";

const DRAG_THRESHOLD_PX = 4;
const SCROLL_EDGE_PX = 48;
const SCROLL_STEP_PX = 12;

type ActiveDrop = {
  id: string;
  placement: BlockDropPlacement;
};

function isDragHandle(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(".bn-block-drag-handle"));
}

function findBlockElement(editorRoot: HTMLElement, blockId: string): HTMLElement | null {
  return (
    Array.from(editorRoot.querySelectorAll<HTMLElement>(".bn-block-outer[data-id]")).find(
      (element) => element.dataset.id === blockId,
    ) ?? null
  );
}

function blockRowBounds(element: HTMLElement): BlockDropIndicatorBounds {
  const row = Array.from(element.children).find((child) => child.classList.contains("bn-block"));
  const rect = (row ?? element).getBoundingClientRect();
  return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
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

function PointerDragHandleButton() {
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
      <DragHandleMenu />
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

      cleanupRef.current();
      const pointerId = event.pointerId;
      const startX = event.clientX;
      const startY = event.clientY;
      let started = false;
      let sourceElement: HTMLElement | null = null;
      let activeDrop: ActiveDrop | null = null;
      let dropIndicator: HTMLElement | null = null;

      const clearDrop = () => {
        activeDrop = null;
        hideBlockDropIndicator(dropIndicator);
      };

      const cleanup = () => {
        clearDrop();
        dropIndicator?.remove();
        dropIndicator = null;
        sourceElement?.removeAttribute("data-editor-drag-source");
        document.body.removeAttribute("data-editor-block-dragging");
        sideMenu.unfreezeMenu();
        window.removeEventListener("pointermove", onPointerMove, true);
        window.removeEventListener("pointerup", onPointerUp, true);
        window.removeEventListener("pointercancel", onPointerCancel, true);
        cleanupRef.current = () => {};
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
        }

        moveEvent.preventDefault();
        clearDrop();

        const editorRoot = editor.domElement;
        if (editorRoot) {
          const candidates = Array.from(
            editorRoot.querySelectorAll<HTMLElement>(".bn-block-outer[data-id]"),
          ).flatMap((element) => {
            const id = element.dataset.id;
            if (!id || !canReorderBlock(editor, block.id, id)) return [];
            return [{ id, ...blockRowBounds(element) }];
          });
          const drop = resolveVerticalDropTarget(candidates, moveEvent.clientY);
          const targetElement = drop ? findBlockElement(editorRoot, drop.id) : null;
          if (drop && targetElement) {
            if (!dropIndicator) dropIndicator = createBlockDropIndicator(document);
            positionBlockDropIndicator(
              dropIndicator,
              blockRowBounds(targetElement),
              drop.placement,
            );
            activeDrop = {
              id: drop.id,
              placement: drop.placement,
            };
          }
        }

        const scrollRoot = editorRoot?.closest<HTMLElement>("[data-scroll-root]");
        if (scrollRoot) {
          const rect = scrollRoot.getBoundingClientRect();
          if (moveEvent.clientY < rect.top + SCROLL_EDGE_PX) scrollRoot.scrollTop -= SCROLL_STEP_PX;
          if (moveEvent.clientY > rect.bottom - SCROLL_EDGE_PX) scrollRoot.scrollTop += SCROLL_STEP_PX;
        }
      };

      const onPointerUp = (upEvent: PointerEvent) => {
        if (upEvent.pointerId !== pointerId) return;
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
      onClickCapture={(event) => {
        if (!suppressClickRef.current || !isDragHandle(event.target)) return;
        event.preventDefault();
        event.stopPropagation();
        suppressClickRef.current = false;
      }}
    >
      <AddBlockButton />
      <PointerDragHandleButton />
    </Root>
  );
}

export function EditorSideMenu() {
  return <SideMenuController sideMenu={PointerReorderSideMenu} />;
}
