'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { runGenerateSummaryFlow, buildSummaryPreviewPath } from '@/lib/session-summary';
import { resolveSummaryTemplate } from '@/lib/resolve-summary-template';
import { TemplateSelectModal } from '@/components/template-select-modal';
import { OrgIdentityModal, promptOrgIdentityIfNeeded } from '@/components/org-identity-modal';
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
  orgId?: string | null;
  summaryOrgId?: string | null;
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
  // 模板选择弹窗状态
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [pendingTemplates, setPendingTemplates] = useState<SummaryTemplateItem[]>([]);
  const [pendingDefaultId, setPendingDefaultId] = useState('');
  // 非 regenerate 模式下，resolve 模板后暂存的 sessionId，modal 确认后继续
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [pendingRegenerate, setPendingRegenerate] = useState(false);
  const [showOrgModal, setShowOrgModal] = useState(false);
  const [orgDefaultId, setOrgDefaultId] = useState<string | null>(null);
  const [pendingGenerate, setPendingGenerate] = useState<{
    sessionId: string;
    templateId: string;
    regenerate: boolean;
  } | null>(null);

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

  const openSession = async (id: string) => {
    try {
      const session = sessions.find((s) => s.id === id);
      const preferredId =
        templateId && session && hasCachedSummary(session, templateId)
          ? templateId
          : session?.summaryTemplateIds?.[0] ?? templateId;

      if (!preferredId) {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/sessions/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        setCurrentSession({
          id: data.id,
          title: data.title,
          createdAt: data.createdAt,
          fullText: data.fullText,
          summaryTemplateIds: data.summaryTemplateIds,
          summaryTemplates: data.summaryTemplates,
        });
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

  /** 执行实际的生成逻辑（模板与身份已确定后调用） */
  const doGenerate = async (
    sessionId: string,
    tid: string,
    regenerate: boolean,
    orgId: string | null
  ) => {
    setLoadingSummary(true);
    try {
      const data = await runGenerateSummaryFlow({
        sessionId,
        templateId: tid,
        orgId,
        regenerate,
        confirmRegenerate: false,
        navigateToPreview: true,
        router,
      });
      if (!data) return;

      setActiveTemplateId(tid);
      setTemplateId(tid);
      setTemplateName(data.templateName);
      setCurrentSession((prev) =>
        prev
          ? {
              ...prev,
              summary: data.summary,
              templateId: data.templateId,
              templateName: data.templateName,
              orgId: data.orgId ?? orgId,
              summaryOrgId: data.orgId ?? orgId,
              hasSummary: true,
              summaryTemplateIds: Array.from(
                new Set([...(prev.summaryTemplateIds ?? []), data.templateId])
              ),
            }
          : prev
      );
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
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

  const proceedWithOrgSelection = async (
    sessionId: string,
    tid: string,
    regenerate: boolean,
    preferredOrgId?: string | null
  ) => {
    const { needed, orgId } = await promptOrgIdentityIfNeeded(preferredOrgId);
    if (!needed) {
      await doGenerate(sessionId, tid, regenerate, null);
      return;
    }
    setPendingGenerate({ sessionId, templateId: tid, regenerate });
    setOrgDefaultId(orgId);
    setShowOrgModal(true);
  };

  const fetchSummary = async (regenerate = false) => {
    if (!currentSession) return;

    if (regenerate) {
      if (!templateId) return;
      const ok = await confirm(`确定重新生成「${templateName}」？将覆盖当前已保存的纪要。`);
      if (!ok) return;
      const preferredOrgId = currentSession.summaryOrgId ?? currentSession.orgId ?? null;
      await proceedWithOrgSelection(currentSession.id, templateId, true, preferredOrgId);
      return;
    }

    try {
      const resolved = await resolveSummaryTemplate();

      if (resolved.needsSelection && resolved.templates) {
        setPendingTemplates(resolved.templates);
        setPendingDefaultId(resolved.templateId);
        setPendingSessionId(currentSession.id);
        setPendingRegenerate(false);
        setShowTemplateModal(true);
        return;
      }

      await proceedWithOrgSelection(currentSession.id, resolved.templateId, false);
    } catch (err) {
      console.error(err);
      alert('获取模板信息失败');
    }
  };

  const handleTemplateConfirm = async (selectedTemplateId: string) => {
    setShowTemplateModal(false);
    const sid = pendingSessionId;
    const regenerate = pendingRegenerate;
    setPendingSessionId(null);
    setPendingRegenerate(false);
    if (sid) {
      const preferredOrgId = regenerate
        ? (currentSession?.summaryOrgId ?? currentSession?.orgId ?? null)
        : null;
      await proceedWithOrgSelection(sid, selectedTemplateId, regenerate, preferredOrgId);
    }
  };

  const handleTemplateCancel = () => {
    setShowTemplateModal(false);
    setPendingSessionId(null);
    setPendingRegenerate(false);
  };

  const handleOrgConfirm = async (orgId: string | null) => {
    const pending = pendingGenerate;
    setShowOrgModal(false);
    setPendingGenerate(null);
    if (!pending) return;
    await doGenerate(pending.sessionId, pending.templateId, pending.regenerate, orgId);
  };

  const handleOrgCancel = () => {
    setShowOrgModal(false);
    setPendingGenerate(null);
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
                <CardTitle className="truncate">{session.title}</CardTitle>
                <CardDescription className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">
                    {new Date(session.createdAt).toLocaleString()}
                  </span>
                  {session.hasSummary && (
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-normal text-primary">
                      已有纪要
                    </span>
                  )}
                </CardDescription>
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
        <Dialog
          open={openTranscript}
          onOpenChange={(open) => {
            if (!open && loadingSummary) return;
            setOpenTranscript(open);
          }}
        >
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
              {loadingSummary && (
                <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary">
                  <Spinner className="size-4 shrink-0" />
                  <span>正在生成纪要，约需 1–3 分钟，请稍候…</span>
                </div>
              )}

              {/* 已有纪要模板提示 */}
              {currentSession.summaryTemplateIds && currentSession.summaryTemplateIds.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  已有纪要：{currentSession.summaryTemplates?.map(t => t.name).join('、')}
                </p>
              )}

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
                    disabled={loadingSummary}
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

            <TemplateSelectModal
              open={showTemplateModal}
              templates={pendingTemplates}
              defaultTemplateId={pendingDefaultId}
              onConfirm={(id) => void handleTemplateConfirm(id)}
              onCancel={handleTemplateCancel}
            />
          </DialogContent>
        </Dialog>
      )}

      <OrgIdentityModal
        open={showOrgModal}
        defaultOrgId={orgDefaultId}
        confirmLabel={pendingGenerate?.regenerate ? '确认重新生成' : '确认生成'}
        onConfirm={(orgId) => void handleOrgConfirm(orgId)}
        onCancel={handleOrgCancel}
      />
    </div>
  );
}
