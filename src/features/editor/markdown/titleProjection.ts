export type TitleProjection =
  | {
      kind: "atx";
      originalTitle: string;
      raw: string;
      leading: string;
      marker: string;
      closing: string;
      lineEnding: string;
      separator: string;
    }
  | {
      kind: "setext";
      originalTitle: string;
      raw: string;
      leading: string;
      firstLineEnding: string;
      underline: string;
      lineEnding: string;
      separator: string;
    };

export interface ExtractedTitle {
  body: string;
  projection: TitleProjection | null;
}

function isSimpleTitle(value: string): boolean {
  return value.length > 0 && !/[`*_\[\]<>!]/.test(value);
}

export function extractCompatibleTitle(markdown: string, fileTitle: string): ExtractedTitle {
  const atx = markdown.match(
    /^((?:[ \t]*\r?\n)*)([ \t]{0,3}#[ \t]+)([^\r\n]*?)([ \t]+#+)?[ \t]*(\r?\n|$)(\r?\n)?/,
  );
  if (atx) {
    const title = atx[3].trim();
    if (title === fileTitle && isSimpleTitle(title)) {
      return {
        body: markdown.slice(atx[0].length),
        projection: {
          kind: "atx",
          originalTitle: title,
          raw: atx[0],
          leading: atx[1],
          marker: atx[2],
          closing: atx[4] ?? "",
          lineEnding: atx[5],
          separator: atx[6] ?? "",
        },
      };
    }
  }

  const setext = markdown.match(
    /^((?:[ \t]*\r?\n)*)([^\r\n]+)(\r?\n)([ \t]*=+[ \t]*)(\r?\n|$)(\r?\n)?/,
  );
  if (setext) {
    const title = setext[2].trim();
    if (title === fileTitle && isSimpleTitle(title)) {
      return {
        body: markdown.slice(setext[0].length),
        projection: {
          kind: "setext",
          originalTitle: title,
          raw: setext[0],
          leading: setext[1],
          firstLineEnding: setext[3],
          underline: setext[4],
          lineEnding: setext[5],
          separator: setext[6] ?? "",
        },
      };
    }
  }

  return { body: markdown, projection: null };
}

export function restoreCompatibleTitle(
  body: string,
  fileTitle: string,
  projection: TitleProjection | null,
): string {
  if (!projection) return body;
  if (fileTitle === projection.originalTitle) return projection.raw + body;
  if (projection.kind === "atx") {
    return (
      projection.leading +
      projection.marker +
      fileTitle +
      projection.closing +
      projection.lineEnding +
      projection.separator +
      body
    );
  }
  return (
    projection.leading +
    fileTitle +
    projection.firstLineEnding +
    projection.underline +
    projection.lineEnding +
    projection.separator +
    body
  );
}

export function renameCompatibleTitleInFile(
  content: string,
  previousTitle: string,
  nextTitle: string,
): string {
  const frontmatter = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  const prefix = frontmatter?.[0] ?? "";
  const body = content.slice(prefix.length);
  const extracted = extractCompatibleTitle(body, previousTitle);
  if (!extracted.projection) return content;
  return prefix + restoreCompatibleTitle(extracted.body, nextTitle, extracted.projection);
}
