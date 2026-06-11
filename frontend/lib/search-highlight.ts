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

export function highlightPlainText(text: string, query: string): string {
  const safe = escapeHtml(text);
  const q = query.trim();
  if (!q) return safe;
  const re = new RegExp(escapeRegExp(q), 'gi');
  return safe.replace(re, (match) => `<mark class="search-hit">${match}</mark>`);
}

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
