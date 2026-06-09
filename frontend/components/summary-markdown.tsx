'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

type SummaryMarkdownProps = {
  content: string;
  className?: string;
};

export function SummaryMarkdown({ content, className }: SummaryMarkdownProps) {
  return (
    <article
      className={cn(
        'prose prose-neutral dark:prose-invert max-w-none',
        'prose-headings:scroll-mt-20 prose-table:block prose-table:overflow-x-auto',
        className
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </article>
  );
}
