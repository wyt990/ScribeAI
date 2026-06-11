'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { findMatchIndices, highlightPlainText } from '@/lib/search-highlight';

type TranscriptSearchPanelProps = {
  text: string;
  summaryText?: string | null;
  summaryLabel?: string;
};

export function TranscriptSearchPanel({
  text,
  summaryText,
  summaryLabel,
}: TranscriptSearchPanelProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const transcriptMatches = useMemo(
    () => findMatchIndices(text, query),
    [text, query]
  );
  const summaryMatches = useMemo(
    () => (summaryText ? findMatchIndices(summaryText, query) : []),
    [summaryText, query]
  );
  const totalMatches = transcriptMatches.length + summaryMatches.length;

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!query.trim() || totalMatches === 0) return;
    const el = containerRef.current?.querySelector(`[data-match-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeIndex, query, totalMatches]);

  const goPrev = () => {
    if (totalMatches === 0) return;
    setActiveIndex((i) => (i - 1 + totalMatches) % totalMatches);
  };

  const goNext = () => {
    if (totalMatches === 0) return;
    setActiveIndex((i) => (i + 1) % totalMatches);
  };

  const renderHighlighted = (content: string, offset: number) => {
    if (!content) return highlightPlainText('（无内容）', '');
    if (!query.trim()) {
      return highlightPlainText(content, '');
    }

    const q = query.trim();
    const lower = content.toLowerCase();
    const lowerQ = q.toLowerCase();
    const parts: string[] = [];
    let cursor = 0;
    let matchIdx = offset;

    while (cursor < content.length) {
      const idx = lower.indexOf(lowerQ, cursor);
      if (idx === -1) {
        parts.push(highlightPlainText(content.slice(cursor), ''));
        break;
      }
      if (idx > cursor) {
        parts.push(highlightPlainText(content.slice(cursor, idx), ''));
      }
      const matched = content.slice(idx, idx + q.length);
      const isActive = matchIdx === activeIndex;
      parts.push(
        `<mark class="search-hit rounded px-0.5 ${isActive ? 'bg-yellow-400 dark:bg-yellow-500 ring-1 ring-yellow-600' : 'bg-yellow-200 dark:bg-yellow-800'}" data-match-idx="${matchIdx}">${matched.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</mark>`
      );
      matchIdx += 1;
      cursor = idx + q.length;
    }

    return parts.join('');
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="在本条会话内搜索（转录 / 纪要）"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-sm"
        />
        {query.trim() && (
          <>
            <span className="text-xs text-muted-foreground">
              {totalMatches > 0 ? `${activeIndex + 1} / ${totalMatches} 处匹配` : '无匹配'}
            </span>
            <Button type="button" variant="outline" size="sm" onClick={goPrev} disabled={totalMatches === 0}>
              上一处
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={goNext} disabled={totalMatches === 0}>
              下一处
            </Button>
          </>
        )}
      </div>

      <div
        ref={containerRef}
        className="w-full max-h-64 overflow-y-auto p-4 border rounded text-sm whitespace-pre-wrap leading-relaxed"
      >
        <div
          dangerouslySetInnerHTML={{
            __html: renderHighlighted(text || '', 0),
          }}
        />
        {summaryText?.trim() && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-xs text-muted-foreground mb-2">
              纪要{summaryLabel ? `（${summaryLabel}）` : ''}
            </p>
            <div
              dangerouslySetInnerHTML={{
                __html: renderHighlighted(summaryText, transcriptMatches.length),
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
