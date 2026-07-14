import { BlockNoteSchema, type Block, type BlockNoteEditor } from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";
import { useTranslation } from "react-i18next";

export const RawMarkdownBlock = createReactBlockSpec(
  {
    type: "rawMarkdown",
    propSchema: {
      source: { default: "" },
    },
    content: "none",
  },
  {
    render: ({ block, editor }) => {
      const { t } = useTranslation();
      return (
        <div className="my-1 w-full border-l-2 border-warning/50 pl-3">
          <label className="block text-[11px] font-medium text-ink-muted">
            {t("editor.preservedMarkdown")}
          </label>
          <textarea
            value={block.props.source}
            spellCheck={false}
            aria-label={t("editor.preservedMarkdown")}
            onChange={(event) => {
              editor.updateBlock(block, { props: { source: event.target.value } });
            }}
            className="mt-1 block min-h-20 w-full resize-y bg-transparent font-mono text-[13px] leading-5 text-ink outline-none"
          />
        </div>
      );
    },
  },
)();

export const paperlySchema = BlockNoteSchema.create().extend({
  blockSpecs: {
    rawMarkdown: RawMarkdownBlock,
  },
});

export type PaperlyEditor = BlockNoteEditor<
  typeof paperlySchema.blockSchema,
  typeof paperlySchema.inlineContentSchema,
  typeof paperlySchema.styleSchema
>;

export type PaperlyBlock = Block<
  typeof paperlySchema.blockSchema,
  typeof paperlySchema.inlineContentSchema,
  typeof paperlySchema.styleSchema
>;
