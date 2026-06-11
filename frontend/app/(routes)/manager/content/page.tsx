'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RecordingPanel } from '@/components/recording-panel';
import { managerApi } from '@/lib/manager-api';

type ContentItem = {
  id: string;
  title: string;
  createdAt?: string;
  lastSavedAt?: string;
  status?: string;
  hasRecording?: boolean;
  user?: { name?: string };
};

type RecordingTarget =
  | { kind: 'transcripts'; item: ContentItem }
  | { kind: 'drafts'; item: ContentItem }
  | null;

export default function ManagerContentPage() {
  const [transcripts, setTranscripts] = useState<ContentItem[]>([]);
  const [drafts, setDrafts] = useState<ContentItem[]>([]);
  const [recordingTarget, setRecordingTarget] = useState<RecordingTarget>(null);

  const reload = async () => {
    const [t, d] = await Promise.all([
      managerApi.content.transcripts(),
      managerApi.content.drafts(),
    ]);
    setTranscripts(t.transcripts as ContentItem[]);
    setDrafts(d.drafts as ContentItem[]);
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
            <div key={t.id} className="p-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{t.title}</p>
                <p className="text-muted-foreground text-xs">
                  {t.user?.name} · {t.createdAt ? new Date(t.createdAt).toLocaleString() : '—'}
                  {t.hasRecording ? ' · 有录音' : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {t.hasRecording && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setRecordingTarget({ kind: 'transcripts', item: t })}
                  >
                    录音
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive"
                  onClick={() => void managerApi.content.deleteTranscript(t.id).then(reload)}
                >
                  删除
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-medium mb-2">草稿</h2>
        <div className="border rounded-lg divide-y text-sm">
          {drafts.map((d) => (
            <div key={d.id} className="p-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{d.title}</p>
                <p className="text-muted-foreground text-xs">
                  {d.user?.name} · {d.status}
                  {d.hasRecording ? ' · 有录音' : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {d.hasRecording && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setRecordingTarget({ kind: 'drafts', item: d })}
                  >
                    录音
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive"
                  onClick={() => void managerApi.content.deleteDraft(d.id).then(reload)}
                >
                  删除
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <Dialog open={!!recordingTarget} onOpenChange={(open) => !open && setRecordingTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>归档录音</DialogTitle>
            <DialogDescription>{recordingTarget?.item.title}</DialogDescription>
          </DialogHeader>
          {recordingTarget && (
            <RecordingPanel
              scope={recordingTarget.kind === 'transcripts' ? 'sessions' : 'drafts'}
              id={recordingTarget.item.id}
              manager
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
