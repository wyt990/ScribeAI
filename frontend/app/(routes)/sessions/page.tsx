'use client';

import { useEffect, useState } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DEFAULT_SUMMARY_TYPE,
  SUMMARY_TYPE_LABELS,
  SUMMARY_TYPES,
  type SummaryType,
} from '@/lib/summary-types';

interface SessionListItem {
  id: string;
  title: string;
  createdAt: string;
  hasSummary?: boolean;
  summaryTypes?: string[];
}

interface SessionDetail extends SessionListItem {
  fullText?: string;
  summary?: string | null;
  summaryType?: string | null;
}

export default function SessionsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentSession, setCurrentSession] = useState<SessionDetail | null>(null);
  const [openTranscript, setOpenTranscript] = useState(false);
  const [summaryType, setSummaryType] = useState<SummaryType>(DEFAULT_SUMMARY_TYPE);
  const [activeSummaryType, setActiveSummaryType] = useState<SummaryType | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  const hasCachedSummary = (session: SessionListItem, type: SummaryType) =>
    session.summaryTypes?.includes(type) ?? false;

  const goToSummaryPreview = (sessionId: string, type: SummaryType) => {
    router.push(`/sessions/${sessionId}/summary?summaryType=${type}`);
  };

  const fetchSessionDetail = async (id: string, type: SummaryType = DEFAULT_SUMMARY_TYPE) => {
    const token = localStorage.getItem("token");
    const res = await fetch(`/api/sessions/${id}?summaryType=${type}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json() as Promise<SessionDetail>;
  };

  useEffect(() => {
    const token = localStorage.getItem("token");
    const fetchSessions = async () => {
      try {
        const res = await fetch("/api/sessions", {
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
      const preferredType = hasCachedSummary(
        sessions.find((s) => s.id === id) ?? { id, title: '', createdAt: '' },
        summaryType
      )
        ? summaryType
        : DEFAULT_SUMMARY_TYPE;
      const data = await fetchSessionDetail(id, preferredType);
      setCurrentSession(data);
      setOpenTranscript(true);
      setSummaryType(preferredType);
      setActiveSummaryType(
        data.summaryType && SUMMARY_TYPES.includes(data.summaryType as SummaryType)
          ? (data.summaryType as SummaryType)
          : null
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`确定删除会议「${title}」？此操作不可恢复。`)) return;

    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`/api/sessions/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("删除失败");

      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (currentSession?.id === id) {
        setCurrentSession(null);
        setOpenTranscript(false);
      }
    } catch (err) {
      console.error(err);
      alert("删除会议失败");
    }
  };

  const openSummaryFromCard = (session: SessionListItem) => {
    const type = session.summaryTypes?.includes(DEFAULT_SUMMARY_TYPE)
      ? DEFAULT_SUMMARY_TYPE
      : (session.summaryTypes?.[0] as SummaryType) ?? DEFAULT_SUMMARY_TYPE;
    goToSummaryPreview(session.id, type);
  };

  const fetchSummary = async (regenerate = false) => {
    if (!currentSession) return;
    if (
      regenerate &&
      !confirm(
        `确定重新生成「${SUMMARY_TYPE_LABELS[summaryType]}」？将覆盖当前已保存的摘要。`
      )
    ) {
      return;
    }

    setLoadingSummary(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`/api/sessions/${currentSession.id}/summary`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ summaryType, regenerate }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "生成摘要失败");
      }
      const data = await res.json();
      setActiveSummaryType(summaryType);
      setCurrentSession((prev) =>
        prev
          ? {
              ...prev,
              summary: data.summary,
              summaryType: data.summaryType,
              hasSummary: true,
              summaryTypes: Array.from(
                new Set([...(prev.summaryTypes ?? []), data.summaryType])
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
                summaryTypes: Array.from(
                  new Set([...(s.summaryTypes ?? []), data.summaryType])
                ),
              }
            : s
        )
      );
      goToSummaryPreview(currentSession.id, summaryType);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "生成摘要失败");
    } finally {
      setLoadingSummary(false);
    }
  };

  const switchCachedSummaryType = async (type: SummaryType) => {
    if (!currentSession) return;
    setSummaryType(type);
    if (!hasCachedSummary(currentSession, type)) {
      setActiveSummaryType(null);
      return;
    }
    setActiveSummaryType(type);
  };

  const hasSummaryForCurrentType =
    !!currentSession &&
    activeSummaryType === summaryType &&
    hasCachedSummary(currentSession, summaryType);

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
                      已有摘要
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
                    查看摘要
                  </Button>
                  <Button className="flex-1" onClick={() => openSession(session.id)}>
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
                <span className="text-sm text-muted-foreground shrink-0">摘要模式</span>
                <Select
                  value={summaryType}
                  onValueChange={(v) => void switchCachedSummaryType(v as SummaryType)}
                >
                  <SelectTrigger className="w-[220px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUMMARY_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {SUMMARY_TYPE_LABELS[type]}
                        {hasCachedSummary(currentSession, type) ? " ✓" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-wrap gap-2">
                {hasSummaryForCurrentType ? (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => void fetchSummary(true)}
                      disabled={loadingSummary}
                    >
                      {loadingSummary ? "生成中（约 1–3 分钟）..." : "重新生成摘要"}
                    </Button>
                    <Button
                      onClick={() => goToSummaryPreview(currentSession.id, summaryType)}
                      disabled={loadingSummary}
                    >
                      查看摘要
                    </Button>
                  </>
                ) : (
                  <Button onClick={() => void fetchSummary()} disabled={loadingSummary}>
                    {loadingSummary ? "生成中（约 1–3 分钟）..." : "生成摘要"}
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
