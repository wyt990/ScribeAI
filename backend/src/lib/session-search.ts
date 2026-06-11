import { prisma } from './prisma';
import { getRecordingMeta } from './audio-archive';
import { extractSnippet, escapeLike, highlightPlainText } from './search-snippet';
import { searchUserSessionsLike } from './session-search-fallback';

export type SearchHitField = 'title' | 'transcript' | 'summary';

export type SessionSearchHit = {
  field: SearchHitField;
  snippet: string;
  snippetHtml: string;
  templateName?: string;
  score: number;
};

export type SessionSearchResult = {
  id: string;
  title: string;
  createdAt: string;
  hasSummary: boolean;
  hasRecording: boolean;
  hits: SessionSearchHit[];
  score: number;
};

type TranscriptRow = {
  id: string;
  title: string;
  fullText: string | null;
  createdAt: Date;
  recordingId: string | null;
  title_score: number | null;
  text_score: number | null;
};

type SummaryRow = {
  transcriptId: string;
  text: string;
  templateName: string;
  summary_score: number | null;
};

export async function searchUserSessions(
  userId: string,
  query: string,
  limit = 30
): Promise<SessionSearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  const likePattern = `%${escapeLike(q)}%`;
  const cap = Math.min(Math.max(limit, 1), 50);

  try {
    return await searchUserSessionsFulltext(userId, q, cap, likePattern);
  } catch (err) {
    console.warn('[SessionSearch] FULLTEXT failed, falling back to LIKE:', err);
    return searchUserSessionsLike(userId, q, cap);
  }
}

async function searchUserSessionsFulltext(
  userId: string,
  q: string,
  cap: number,
  likePattern: string
): Promise<SessionSearchResult[]> {
  const [transcriptRows, summaryRows, summaryFlags] = await Promise.all([
    prisma.$queryRaw<TranscriptRow[]>`
      SELECT
        t.id,
        t.title,
        t.fullText,
        t.createdAt,
        t.recordingId,
        MATCH(t.title) AGAINST (${q} IN NATURAL LANGUAGE MODE) AS title_score,
        MATCH(t.fullText) AGAINST (${q} IN NATURAL LANGUAGE MODE) AS text_score
      FROM Transcript t
      WHERE t.userId = ${userId}
        AND (
          MATCH(t.title, t.fullText) AGAINST (${q} IN NATURAL LANGUAGE MODE)
          OR t.title LIKE ${likePattern}
          OR t.fullText LIKE ${likePattern}
        )
      ORDER BY GREATEST(
        COALESCE(MATCH(t.title) AGAINST (${q} IN NATURAL LANGUAGE MODE), 0),
        COALESCE(MATCH(t.fullText) AGAINST (${q} IN NATURAL LANGUAGE MODE), 0)
      ) DESC
      LIMIT ${cap}
    `,
    prisma.$queryRaw<SummaryRow[]>`
      SELECT
        s.transcriptId,
        s.text,
        st.name AS templateName,
        MATCH(s.text) AGAINST (${q} IN NATURAL LANGUAGE MODE) AS summary_score
      FROM Summary s
      INNER JOIN Transcript t ON t.id = s.transcriptId
      INNER JOIN SummaryTemplate st ON st.id = s.templateId
      WHERE s.userId = ${userId}
        AND (
          MATCH(s.text) AGAINST (${q} IN NATURAL LANGUAGE MODE)
          OR s.text LIKE ${likePattern}
        )
      ORDER BY MATCH(s.text) AGAINST (${q} IN NATURAL LANGUAGE MODE) DESC
      LIMIT ${cap * 2}
    `,
    prisma.summary.groupBy({
      by: ['transcriptId'],
      where: { userId },
      _count: { transcriptId: true },
    }),
  ]);

  const hasSummarySet = new Set(summaryFlags.map((r) => r.transcriptId));
  const merged = new Map<string, SessionSearchResult>();

  const ensureResult = (row: {
    id: string;
    title: string;
    createdAt: Date;
    recordingId: string | null;
  }): SessionSearchResult => {
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

  for (const row of transcriptRows) {
    const item = ensureResult(row);
    const titleScore = Number(row.title_score ?? 0);
    const textScore = Number(row.text_score ?? 0);

    if (row.title.toLowerCase().includes(q.toLowerCase()) || titleScore > 0) {
      const snippet = extractSnippet(row.title, q, 40) || row.title;
      item.hits.push({
        field: 'title',
        snippet,
        snippetHtml: highlightPlainText(snippet, q),
        score: Math.max(titleScore, row.title.toLowerCase().includes(q.toLowerCase()) ? 1 : 0),
      });
    }

    if (row.fullText && (row.fullText.toLowerCase().includes(q.toLowerCase()) || textScore > 0)) {
      const snippet = extractSnippet(row.fullText, q);
      item.hits.push({
        field: 'transcript',
        snippet,
        snippetHtml: highlightPlainText(snippet, q),
        score: Math.max(textScore, row.fullText.toLowerCase().includes(q.toLowerCase()) ? 0.8 : 0),
      });
    }
  }

  const summaryTranscriptIds = [...new Set(summaryRows.map((r) => r.transcriptId))];
  const summaryTranscripts = await prisma.transcript.findMany({
    where: { id: { in: summaryTranscriptIds }, userId },
    select: { id: true, title: true, createdAt: true, recordingId: true },
  });
  const summaryTranscriptMap = new Map(summaryTranscripts.map((t) => [t.id, t]));

  for (const row of summaryRows) {
    const transcript = summaryTranscriptMap.get(row.transcriptId);
    if (!transcript) continue;

    const item = ensureResult(transcript);
    const summaryScore = Number(row.summary_score ?? 0);
    const snippet = extractSnippet(row.text, q);
    item.hits.push({
      field: 'summary',
      snippet,
      snippetHtml: highlightPlainText(snippet, q),
      templateName: row.templateName,
      score: Math.max(summaryScore, row.text.toLowerCase().includes(q.toLowerCase()) ? 0.7 : 0),
    });
  }

  const results = Array.from(merged.values())
    .map((item) => {
      item.score = item.hits.reduce((max, h) => Math.max(max, h.score), 0);
      item.hits.sort((a, b) => b.score - a.score);
      return item;
    })
    .filter((item) => item.hits.length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, cap);

  return results;
}
