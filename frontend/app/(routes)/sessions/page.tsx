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
import { RecordingPanel } from '@/components/recording-panel';
import { TranscriptSearchPanel } from '@/components/transcript-search-panel';
import { SessionSearchResults } from '@/components/session-search-results';
import { searchSessions, type SessionSearchResult } from '@/lib/session-search-api';
import { Input } from '@/components/ui/input';
import { useAppDialog } from '@/hooks/use-app-dialog';
import { localizeError } from '@/lib/localize-error';
import { SUMMARY_GENERATION_HINT } from '@/lib/summary-timing';

interface SessionListItem {
  id: string;
  title: string;
  createdAt: string;
  hasSummary?: boolean;
  hasRecording?: boolean;
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
  const { confirm, alert, dialogUi } = useAppDialog();
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
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
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SessionSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchMode, setSearchMode] = useState(false);

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
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      setSearchMode(false);
      setSearching(false);
      return;
    }

    setSearching(true);
    setSearchError(null);
    setSearchMode(true);
    const timer = setTimeout(() => {
      void searchSessions(q)
        .then((data) => {
          setSearchResults(data.results);
          setSearchError(null);
        })
        .catch((err) => {
          console.error(err);
          setSearchResults([]);
          setSearchError(localizeError(err instanceof Error ? err.message : '搜索失败'));
        })
        .finally(() => setSearching(false));
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const fetchSessions = async () => {
      try {
        const res = await fetch('/api/sessions', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error || '加载会议列表失败');
        }
        const data = await res.json();
        setSessions(data);
        setListError(null);
      } catch (err) {
        console.error(err);
        setListError(localizeError(err instanceof Error ? err.message : '加载失败'));
        setSessions([]);
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
    const ok = await confirm(`确定删除会议「${title}」？此操作不可恢复。`, {
      title: '删除会议',
      confirmLabel: '删除',
      destructive: true,
    });
    if (!ok) return;

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
      await alert(localizeError(err instanceof Error ? err.message : '删除会议失败'));
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
      await alert(localizeError(err instanceof Error ? err.message : '生成纪要失败'));
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
      const ok = await confirm(`确定重新生成「${templateName}」？将覆盖当前已保存的纪要。`, {
        title: '重新生成纪要',
        confirmLabel: '重新生成',
      });
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
      await alert(localizeError(err instanceof Error ? err.message : '获取模板信息失败'));
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
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <Input
          placeholder="搜索标题、转录全文、纪要内容…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-xl"
        />
        {searchQuery.trim() && (
          <Button variant="ghost" size="sm" onClick={() => setSearchQuery('')}>
            清除搜索
          </Button>
        )}
      </div>

      {searchMode ? (
        <SessionSearchResults
          query={searchQuery}
          results={searchResults}
          searching={searching}
          searchError={searchError}
          onOpenSession={(id) => void openSession(id)}
        />
      ) : loading ? (
        <div className="flex items-center justify-center h-64 text-muted-foreground gap-2">
          <Spinner className="size-5" />
          <p>加载会议列表…</p>
        </div>
      ) : listError ? (
        <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
          <p className="text-destructive">{listError}</p>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            重新加载
          </Button>
        </div>
      ) : sessions.length === 0 ? (
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
                  <span className="shrink-0 flex gap-1">
                    {session.hasRecording && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                        有录音
                      </span>
                    )}
                    {session.hasSummary && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-normal text-primary">
                        已有纪要
                      </span>
                    )}
                  </span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
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
                  <Button
                    variant="outline"
                    className="shrink-0 text-destructive hover:text-destructive"
                    onClick={() => void handleDelete(session.id, session.title)}
                  >
                    删除
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

            <div className="mt-4">
              <TranscriptSearchPanel
                text={currentSession.fullText || ''}
                summaryText={currentSession.summary}
                summaryLabel={currentSession.templateName ?? undefined}
              />
            </div>

            <RecordingPanel
              scope="sessions"
              id={currentSession.id}
              onRetranscribed={(fullText) => {
                setCurrentSession((prev) => (prev ? { ...prev, fullText } : prev));
              }}
            />

            <div className="mt-4 space-y-3">
              {loadingSummary && (
                <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary">
                  <Spinner className="size-4 shrink-0" />
                  <span>正在生成纪要，{SUMMARY_GENERATION_HINT}，请稍候…</span>
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
                      {loadingSummary ? `生成中（${SUMMARY_GENERATION_HINT}）...` : '重新生成纪要'}
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
                    {loadingSummary ? `生成中（${SUMMARY_GENERATION_HINT}）...` : '生成纪要'}
                  </Button>
                )}
                <Button variant="outline" onClick={() => setOpenTranscript(false)}>
                  关闭
                </Button>
                <Button
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => void handleDelete(currentSession.id, currentSession.title)}
                >
                  删除
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

      {dialogUi}
    </div>
  );
}
