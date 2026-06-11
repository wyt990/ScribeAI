export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function escapeLike(text: string): string {
  return text.replace(/[%_\\]/g, '\\$&');
}

/** 提取命中关键词附近的摘要片段 */
export function extractSnippet(text: string, query: string, radius = 56): string {
  if (!text?.trim()) return '';
  if (!query.trim()) return text.slice(0, radius * 2) + (text.length > radius * 2 ? '…' : '');

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);
  if (idx === -1) {
    return text.slice(0, radius * 2) + (text.length > radius * 2 ? '…' : '');
  }

  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + query.length + radius);
  let snippet = text.slice(start, end);
  if (start > 0) snippet = `…${snippet}`;
  if (end < text.length) snippet = `${snippet}…`;
  return snippet;
}

/** 将纯文本中的关键词包裹为 mark（需配合 escapeHtml 防 XSS） */
export function highlightPlainText(text: string, query: string): string {
  const safe = escapeHtml(text);
  const q = query.trim();
  if (!q) return safe;

  const re = new RegExp(escapeRegExp(q), 'gi');
  return safe.replace(re, (match) => `<mark class="search-hit">${match}</mark>`);
}

/** 返回所有匹配起始下标（用于会话内跳转） */
export function findMatchIndices(text: string, query: string): number[] {
  if (!text || !query.trim()) return [];
  const indices: number[] = [];
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let from = 0;
  while (from < lowerText.length) {
    const idx = lowerText.indexOf(lowerQuery, from);
    if (idx === -1) break;
    indices.push(idx);
    from = idx + Math.max(1, lowerQuery.length);
  }
  return indices;
}
