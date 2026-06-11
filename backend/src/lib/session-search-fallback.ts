import { prisma } from './prisma';
import { getRecordingMeta } from './audio-archive';
import { extractSnippet, highlightPlainText } from './search-snippet';
import type { SessionSearchResult } from './session-search';

/** LIKE 回退检索（无 FULLTEXT 索引或查询失败时使用） */
export async function searchUserSessionsLike(
  userId: string,
  query: string,
  limit = 30
): Promise<SessionSearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  const cap = Math.min(Math.max(limit, 1), 50);
  const lowerQ = q.toLowerCase();

  const [transcripts, summaries, summaryFlags] = await Promise.all([
    prisma.transcript.findMany({
      where: {
        userId,
        OR: [{ title: { contains: q } }, { fullText: { contains: q } }],
      },
      select: {
        id: true,
        title: true,
        fullText: true,
        createdAt: true,
        recordingId: true,
      },
      orderBy: { createdAt: 'desc' },
      take: cap,
    }),
    prisma.summary.findMany({
      where: { userId, text: { contains: q } },
      select: {
        transcriptId: true,
        text: true,
        template: { select: { name: true } },
        transcript: {
          select: { id: true, title: true, createdAt: true, recordingId: true },
        },
      },
      take: cap * 2,
    }),
    prisma.summary.groupBy({
      by: ['transcriptId'],
      where: { userId },
      _count: { transcriptId: true },
    }),
  ]);

  const hasSummarySet = new Set(summaryFlags.map((r) => r.transcriptId));
  const merged = new Map<string, SessionSearchResult>();

  const ensure = (row: {
    id: string;
    title: string;
    createdAt: Date;
    recordingId: string | null;
  }) => {
    let item = merged.get(row.id);
    if (!item) {
      item = {
        id: row.id,
        title: row.title,
        createdAt: row.createdAt.toISOString(),
        hasSummary: hasSummarySet.has(row.id),
        hasRecording: row.recordingId
          ? getRecordingMeta(userId, row.recordingId).exists
          : false,
        hits: [],
        score: 0,
      };
      merged.set(row.id, item);
    }
    return item;
  };

  for (const row of transcripts) {
    const item = ensure(row);
    if (row.title.toLowerCase().includes(lowerQ)) {
      const snippet = extractSnippet(row.title, q, 40) || row.title;
      item.hits.push({
        field: 'title',
        snippet,
        snippetHtml: highlightPlainText(snippet, q),
        score: 1,
      });
    }
    if (row.fullText?.toLowerCase().includes(lowerQ)) {
      const snippet = extractSnippet(row.fullText, q);
      item.hits.push({
        field: 'transcript',
        snippet,
        snippetHtml: highlightPlainText(snippet, q),
        score: 0.8,
      });
    }
  }

  for (const row of summaries) {
    const t = row.transcript;
    const item = ensure(t);
    if (!row.text.toLowerCase().includes(lowerQ)) continue;
    const snippet = extractSnippet(row.text, q);
    item.hits.push({
      field: 'summary',
      snippet,
      snippetHtml: highlightPlainText(snippet, q),
      templateName: row.template.name,
      score: 0.7,
    });
  }

  return Array.from(merged.values())
    .map((item) => {
      item.score = item.hits.reduce((max, h) => Math.max(max, h.score), 0);
      item.hits.sort((a, b) => b.score - a.score);
      return item;
    })
    .filter((item) => item.hits.length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, cap);
}
