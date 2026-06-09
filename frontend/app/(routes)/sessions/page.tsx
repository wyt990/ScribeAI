'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { SummaryTemplateSelect } from '@/components/summary-template-select';
import { runGenerateSummaryFlow, buildSummaryPreviewPath } from '@/lib/session-summary';
import type { SummaryTemplateItem } from '@/lib/summary-templates';

interface SessionListItem {
  id: string;
  title: string;
  createdAt: string;
  hasSummary?: boolean;
  summaryTemplateIds?: string[];
  summaryTemplates?: { id: string; name: string }[];
}

interface SessionDetail extends SessionListItem {
  fullText?: string;
  summary?: string | null;
  templateId?: string | null;
  templateName?: string | null;
}

export default function SessionsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentSession, setCurrentSession] = useState<SessionDetail | null>(null);
  const [openTranscript, setOpenTranscript] = useState(false);
  const [templateId, setTemplateId] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  const hasCachedSummary = (session: SessionListItem, tid: string) =>
    session.summaryTemplateIds?.includes(tid) ?? false;

  const goToSummaryPreview = (sessionId: string, tid: string) => {
    router.push(buildSummaryPreviewPath(sessionId, tid));
  };

  const fetchSessionDetail = async (id: string, tid: string) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/sessions/${id}?templateId=${encodeURIComponent(tid)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json() as Promise<SessionDetail>;
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    const fetchSessions = async () => {
      try {
        const res = await fetch('/api/sessions', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        setSessions(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchSessions();
  }, []);

  const handleTemplateChange = useCallback((id: string, t: SummaryTemplateItem) => {
    setTemplateId(id);
    setTemplateName(t.name);
    if (currentSession && hasCachedSummary(currentSession, id)) {
      setActiveTemplateId(id);
    } else {
      setActiveTemplateId(null);
    }
  }, [currentSession]);

  const openSession = async (id: string) => {
    try {
      const session = sessions.find((s) => s.id === id);
      const preferredId =
        templateId && session && hasCachedSummary(session, templateId)
          ? templateId
          : session?.summaryTemplateIds?.[0] ?? templateId;

      if (!preferredId) {
        setCurrentSession({ id, title: session?.title ?? '', createdAt: session?.createdAt ?? '' });
        setOpenTranscript(true);
        return;
      }

      const data = await fetchSessionDetail(id, preferredId);
      setCurrentSession(data);
      setOpenTranscript(true);
      setTemplateId(preferredId);
      setTemplateName(data.templateName ?? '');
      setActiveTemplateId(
        data.summaryTemplateIds?.includes(preferredId) ? preferredId : null
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`确定删除会议「${title}」？此操作不可恢复。`)) return;

    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`/api/sessions/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('删除失败');

      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (currentSession?.id === id) {
        setCurrentSession(null);
        setOpenTranscript(false);
      }
    } catch (err) {
      console.error(err);
      alert('删除会议失败');
    }
  };

  const openSummaryFromCard = (session: SessionListItem) => {
    const tid = session.summaryTemplateIds?.[0];
    if (!tid) return;
    goToSummaryPreview(session.id, tid);
  };

  const fetchSummary = async (regenerate = false) => {
    if (!currentSession || !templateId) return;

    if (regenerate) {
      const ok = await confirm(`确定重新生成「${templateName}」？将覆盖当前已保存的纪要。`);
      if (!ok) return;
    }

    setLoadingSummary(true);
    try {
      const data = await runGenerateSummaryFlow({
        sessionId: currentSession.id,
        templateId,
        regenerate,
        confirmRegenerate: false,
        navigateToPreview: true,
        router,
      });
      if (!data) return;

      setActiveTemplateId(templateId);
      setCurrentSession((prev) =>
        prev
          ? {
              ...prev,
              summary: data.summary,
              templateId: data.templateId,
              templateName: data.templateName,
              hasSummary: true,
              summaryTemplateIds: Array.from(
                new Set([...(prev.summaryTemplateIds ?? []), data.templateId])
              ),
            }
          : prev
      );
      setSessions((prev) =>
        prev.map((s) =>
          s.id === currentSession.id
            ? {
                ...s,
                hasSummary: true,
                summaryTemplateIds: Array.from(
                  new Set([...(s.summaryTemplateIds ?? []), data.templateId])
                ),
              }
            : s
        )
      );
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : '生成纪要失败');
    } finally {
      setLoadingSummary(false);
    }
  };

  const hasSummaryForCurrentTemplate =
    !!currentSession &&
    !!templateId &&
    activeTemplateId === templateId &&
    hasCachedSummary(currentSession, templateId);

  return (
    <div className="p-6 space-y-6">
      {sessions.length === 0 && !loading ? (
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          <p className="text-lg">暂无会议记录</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sessions.map((session) => (
            <Card key={session.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="truncate">{session.title}</span>
                  {session.hasSummary && (
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-normal text-primary">
                      已有纪要
                    </span>
                  )}
                </CardTitle>
                <CardDescription>{new Date(session.createdAt).toLocaleString()}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="shrink-0 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(session.id, session.title)}
                  >
                    删除
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    disabled={!session.hasSummary}
                    onClick={() => openSummaryFromCard(session)}
                  >
                    查看纪要
                  </Button>
                  <Button className="flex-1" onClick={() => void openSession(session.id)}>
                    查看转录
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {currentSession && (
        <Dialog open={openTranscript} onOpenChange={setOpenTranscript}>
          <DialogContent className="p-6 w-[90vw] max-w-3xl">
            <DialogHeader>
              <DialogTitle>{currentSession.title}</DialogTitle>
              <DialogDescription>
                {new Date(currentSession.createdAt).toLocaleString()}
              </DialogDescription>
            </DialogHeader>

            <textarea
              className="w-full h-64 p-4 mt-4 border rounded"
              readOnly
              value={currentSession.fullText}
            />

            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground shrink-0">纪要模板</span>
                <SummaryTemplateSelect
                  value={templateId}
                  onValueChange={handleTemplateChange}
                  className="w-[240px]"
                  generatedTemplateIds={currentSession.summaryTemplateIds ?? []}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {hasSummaryForCurrentTemplate ? (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => void fetchSummary(true)}
                      disabled={loadingSummary}
                    >
                      {loadingSummary ? '生成中（约 1–3 分钟）...' : '重新生成纪要'}
                    </Button>
                    <Button
                      onClick={() => goToSummaryPreview(currentSession.id, templateId)}
                      disabled={loadingSummary}
                    >
                      查看纪要
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={() => void fetchSummary()}
                    disabled={loadingSummary || !templateId}
                  >
                    {loadingSummary ? '生成中（约 1–3 分钟）...' : '生成纪要'}
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => handleDelete(currentSession.id, currentSession.title)}
                >
                  删除
                </Button>
                <Button variant="outline" onClick={() => setOpenTranscript(false)}>
                  关闭
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
