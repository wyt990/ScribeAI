'use client';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  SEARCH_FIELD_LABEL,
  type SessionSearchResult,
} from '@/lib/session-search-api';

type SessionSearchResultsProps = {
  query: string;
  results: SessionSearchResult[];
  searching: boolean;
  searchError?: string | null;
  onOpenSession: (id: string) => void;
  onOpenSummary?: (id: string, templateId?: string) => void;
};

export function SessionSearchResults({
  query,
  results,
  searching,
  searchError,
  onOpenSession,
}: SessionSearchResultsProps) {
  if (!query.trim()) return null;

  if (searching) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
        <Spinner className="size-4" />
        搜索中…
      </div>
    );
  }

  if (searchError) {
    return (
      <p className="text-center text-destructive py-12">{searchError}</p>
    );
  }

  if (results.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-12">
        未找到与「{query}」相关的会议记录
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">共 {results.length} 条匹配结果</p>
      {results.map((item) => (
        <div key={item.id} className="border rounded-lg p-4 space-y-2 hover:bg-muted/30 transition-colors">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-medium">{item.title}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(item.createdAt).toLocaleString()}
                {item.hasSummary ? ' · 有纪要' : ''}
                {item.hasRecording ? ' · 有录音' : ''}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => onOpenSession(item.id)}>
              打开会话
            </Button>
          </div>
          <ul className="space-y-1.5">
            {item.hits.map((hit, idx) => (
              <li key={`${hit.field}-${idx}`} className="text-sm">
                <span className="text-xs text-muted-foreground mr-2">
                  {SEARCH_FIELD_LABEL[hit.field]}
                  {hit.templateName ? ` · ${hit.templateName}` : ''}
                </span>
                <span
                  className="text-foreground/90"
                  dangerouslySetInnerHTML={{ __html: hit.snippetHtml }}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
