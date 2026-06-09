export async function markdownToDocxBuffer(markdown: string): Promise<Buffer> {
  const mod = await import("@mohtasham/md-to-docx");
  return mod.convertMarkdownToBuffer(markdown);
}
