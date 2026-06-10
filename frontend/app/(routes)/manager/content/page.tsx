'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { managerApi } from '@/lib/manager-api';

export default function ManagerContentPage() {
  const [transcripts, setTranscripts] = useState<Record<string, unknown>[]>([]);
  const [drafts, setDrafts] = useState<Record<string, unknown>[]>([]);

  const reload = async () => {
    const [t, d] = await Promise.all([
      managerApi.content.transcripts(),
      managerApi.content.drafts(),
    ]);
    setTranscripts(t.transcripts as Record<string, unknown>[]);
    setDrafts(d.drafts as Record<string, unknown>[]);
  };

  useEffect(() => {
    void reload().catch(console.error);
  }, []);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">内容管理</h1>

      <section>
        <h2 className="font-medium mb-2">会议记录</h2>
        <div className="border rounded-lg divide-y text-sm">
          {transcripts.map((t) => (
            <div key={String(t.id)} className="p-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{String(t.title)}</p>
                <p className="text-muted-foreground text-xs">
                  {(t.user as { name?: string })?.name} · {new Date(String(t.createdAt)).toLocaleString()}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive"
                onClick={() => void managerApi.content.deleteTranscript(String(t.id)).then(reload)}
              >
                删除
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-medium mb-2">草稿</h2>
        <div className="border rounded-lg divide-y text-sm">
          {drafts.map((d) => (
            <div key={String(d.id)} className="p-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{String(d.title)}</p>
                <p className="text-muted-foreground text-xs">
                  {(d.user as { name?: string })?.name} · {String(d.status)}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive"
                onClick={() => void managerApi.content.deleteDraft(String(d.id)).then(reload)}
              >
                删除
              </Button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
