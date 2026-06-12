import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import { marked } from "marked";

const DEFAULT_FONT_CANDIDATES = [
  process.env.PDF_FONT_PATH,
  path.join(__dirname, "../../assets/fonts/NotoSansSC-Regular.otf"),
  path.join(process.cwd(), "backend/assets/fonts/NotoSansSC-Regular.otf"),
  path.join(process.cwd(), "assets/fonts/NotoSansSC-Regular.otf"),
].filter(Boolean) as string[];

function isUsableFontFile(filePath: string): boolean {
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile() && stat.size > 10_000;
  } catch {
    return false;
  }
}

function resolvePdfBodyFont(): string {
  for (const candidate of DEFAULT_FONT_CANDIDATES) {
    if (isUsableFontFile(candidate)) return candidate;
  }
  throw new Error(
    "未找到支持中文的 PDF 字体。请设置 PDF_FONT_PATH 或安装 Noto Sans CJK。"
  );
}

function resolvePdfBoldFont(bodyFontPath: string): string {
  const dir = path.dirname(bodyFontPath);
  const boldCandidates = [
    process.env.PDF_FONT_BOLD_PATH,
    path.join(dir, "NotoSansSC-Bold.otf"),
    path.join(dir, "NotoSansCJK-Bold.otf"),
  ].filter(Boolean) as string[];
  for (const candidate of boldCandidates) {
    if (isUsableFontFile(candidate)) return candidate;
  }
  return bodyFontPath;
}

function writeLine(
  doc: InstanceType<typeof PDFDocument>,
  text: string,
  opts?: { fontSize?: number; bold?: boolean; gap?: number }
) {
  const fontSize = opts?.fontSize ?? 11;
  doc.font(opts?.bold ? "Bold" : "Body");
  doc.fontSize(fontSize).text(text, { lineGap: opts?.gap ?? 4 });
  doc.moveDown(0.3);
}

export async function markdownToPdfBuffer(
  markdown: string,
  meta: { title: string; createdAt: Date }
): Promise<Buffer> {
  const bodyFontPath = resolvePdfBodyFont();
  const boldFontPath = resolvePdfBoldFont(bodyFontPath);
  const tokens = marked.lexer(markdown, { gfm: true });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 56 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.registerFont("Body", bodyFontPath);
    doc.registerFont("Bold", boldFontPath);
    doc.font("Body");

    writeLine(doc, meta.title, { fontSize: 18, gap: 6, bold: true });
    writeLine(
      doc,
      `生成时间：${meta.createdAt.toLocaleString("zh-CN")}`,
      { fontSize: 10, gap: 2 }
    );
    doc.moveDown(0.5);

    for (const token of tokens) {
      switch (token.type) {
        case "heading": {
          const sizes: Record<number, number> = {
            1: 16,
            2: 14,
            3: 13,
            4: 12,
            5: 11,
            6: 11,
          };
          writeLine(doc, token.text, {
            fontSize: sizes[token.depth] ?? 12,
            gap: 5,
            bold: true,
          });
          break;
        }
        case "paragraph":
          writeLine(doc, token.text);
          break;
        case "blockquote":
          writeLine(doc, `「${token.text}」`, { fontSize: 10, gap: 3 });
          break;
        case "list":
          for (const item of token.items) {
            const prefix = token.ordered ? `${item.task ? "☐" : "•"}` : "•";
            writeLine(doc, `${prefix} ${item.text}`);
          }
          break;
        case "table": {
          const header = token.header.map((c: { text: string }) => c.text).join(" | ");
          writeLine(doc, header, { fontSize: 10 });
          for (const row of token.rows) {
            writeLine(
              doc,
              row.map((c: { text: string }) => c.text).join(" | "),
              { fontSize: 10 }
            );
          }
          doc.moveDown(0.3);
          break;
        }
        case "hr":
          doc.moveDown(0.2);
          doc
            .moveTo(doc.page.margins.left, doc.y)
            .lineTo(doc.page.width - doc.page.margins.right, doc.y)
            .strokeColor("#cccccc")
            .stroke();
          doc.moveDown(0.5);
          break;
        case "code":
          writeLine(doc, token.text, { fontSize: 9, gap: 2 });
          break;
        default:
          if ("text" in token && typeof token.text === "string" && token.text.trim()) {
            writeLine(doc, token.text);
          }
          break;
      }
    }

    doc.end();
  });
}
