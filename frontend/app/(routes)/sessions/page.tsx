'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface Session {
  id: string;
  title: string;
  fullText?: string;
  createdAt: string;
  summary?: { text: string };
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [openTranscript, setOpenTranscript] = useState(false);
  const [openSummary, setOpenSummary] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  // Fetch all sessions
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

  // Open transcript dialog
  const openSession = async (id: string) => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`/api/sessions/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setCurrentSession(data);
      setOpenTranscript(true);
      setSummary(data.summary?.text || null); // preload summary if exists
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`确定删除会话「${title}」？此操作不可恢复。`)) return;

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
        setOpenSummary(false);
        setSummary(null);
      }
    } catch (err) {
      console.error(err);
      alert("删除会话失败");
    }
  };

  // Fetch/generate summary
  const fetchSummary = async () => {
    const token = localStorage.getItem("token");
    if (!currentSession) return;
    setLoadingSummary(true);
    try {
      const res = await fetch(
        `/api/sessions/${currentSession.id}/summary`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await res.json();
      setSummary(data.summary);
      setOpenSummary(true); // open summary modal
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSummary(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {sessions.length === 0 && !loading ? (
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          <p className="text-lg">暂无会话记录</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sessions.map((session) => (
            <Card key={session.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle>{session.title}</CardTitle>
                <CardDescription>{new Date(session.createdAt).toLocaleString()}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={() => openSession(session.id)}>
                    查看转录
                  </Button>
                  <Button
                    variant="outline"
                    className="shrink-0 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(session.id, session.title)}
                  >
                    删除
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Transcript Dialog */}
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

            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={fetchSummary} disabled={loadingSummary}>
                {loadingSummary ? "生成中..." : "摘要"}
              </Button>
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
          </DialogContent>
        </Dialog>
      )}

      {/* Summary Dialog */}
      <Dialog open={openSummary} onOpenChange={setOpenSummary}>
        <DialogContent className="p-6 w-[80vw] max-w-2xl">
          <DialogHeader>
            <DialogTitle>摘要</DialogTitle>
          </DialogHeader>

          <textarea
            className="w-full h-64 p-4 mt-4 border rounded"
            readOnly
            value={summary || ""}
          />

          <div className="mt-4 flex justify-end">
            <Button variant="outline" onClick={() => setOpenSummary(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
