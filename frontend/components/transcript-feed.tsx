"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useRecordingStore } from "@/lib/store";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { promoteDraft } from "@/lib/draft-api";

export function TranscriptFeed() {
  const router = useRouter();
  const { transcript, status, draftId, draftTitle, clearTranscript, clearDraft } =
    useRecordingStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [saving, setSaving] = useState(false);
  const [openTitleDialog, setOpenTitleDialog] = useState(false);
  const [title, setTitle] = useState("");

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript]);

  const hasContent =
    (Array.isArray(transcript) ? transcript.join(" ") : transcript || "").trim().length > 0;

  const canPromote =
    !!draftId && hasContent && (status === "idle" || status === "paused" || status === "completed");

  const openSaveDialog = () => {
    setTitle(draftTitle?.startsWith("草稿") ? "" : draftTitle || "");
    setOpenTitleDialog(true);
  };

  const handlePromote = async () => {
    if (!draftId || !hasContent) return;
    if (!title.trim()) return alert("请输入会话标题");

    setSaving(true);
    try {
      await promoteDraft(draftId, title.trim());
      setOpenTitleDialog(false);
      clearTranscript();
      clearDraft();
      router.replace("/sessions");
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      <Card className="flex flex-col h-full">
        <CardHeader>
          <div className="flex items-center justify-between w-full gap-2">
            <div className="min-w-0">
              <CardTitle>实时转录</CardTitle>
              {draftId && draftTitle && (
                <p className="text-xs text-muted-foreground mt-1 truncate">{draftTitle}</p>
              )}
            </div>

            {status === "recording" && (
              <Badge className="bg-success text-success-foreground flex items-center gap-2 shrink-0">
                <span className="w-2 h-2 rounded-full bg-success-foreground animate-pulse" />
                录音中
              </Badge>
            )}
            {status === "paused" && <Badge className="shrink-0">已暂停</Badge>}
            {status === "processing" && <Badge className="shrink-0">处理中</Badge>}
          </div>
        </CardHeader>

        <CardContent className="flex-1 min-h-0">
          <ScrollArea className="h-full pr-4" ref={scrollRef}>
            {!hasContent ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <p className="text-center">
                  {status === "idle"
                    ? "开始录音以查看实时转录"
                    : "等待转录中..."}
                </p>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-muted/50 border border-border">
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {Array.isArray(transcript)
                    ? transcript.join(" ")
                    : transcript}
                </p>
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={openSaveDialog} disabled={!canPromote}>
          保存为正式会话
        </Button>
      </div>

      <Dialog open={openTitleDialog} onOpenChange={setOpenTitleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>保存为正式会话</DialogTitle>
          </DialogHeader>

          <Input
            placeholder="例如：团队会议、机器学习讲座、讨论..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenTitleDialog(false)}>
              取消
            </Button>
            <Button onClick={handlePromote} disabled={saving}>
              {saving ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
