"use client";

import { useEffect, useRef } from "react";
import { useRecordingStore } from "@/lib/store";
import { useRecordingDuration } from "@/hooks/use-recording-duration";
import { formatRecordingDuration } from "@/lib/recording-duration";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { DashboardDraftActions } from "@/components/dashboard-draft-actions";

export function TranscriptFeed() {
  const { transcript, status, draftId, draftTitle, transcriptionWarning, lastSegmentAgeSec } = useRecordingStore();
  const recordingSeconds = useRecordingDuration();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript]);

  const hasContent =
    (Array.isArray(transcript) ? transcript.join(" ") : transcript || "").trim().length > 0;

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden">
      <Card className="flex flex-col flex-1 min-h-0 overflow-hidden py-0 gap-0">
        <CardHeader className="shrink-0 py-3 px-4 md:px-6">
          <div className="flex items-center justify-between w-full gap-2">
            <div className="min-w-0">
              <CardTitle>实时转录</CardTitle>
              {draftId && draftTitle && (
                <p className="text-xs text-muted-foreground mt-1 truncate">{draftTitle}</p>
              )}
            </div>

            {status === "recording" && (
              <div className="flex flex-col items-end gap-1 shrink-0">
                <Badge className="bg-success text-success-foreground flex items-center gap-2 tabular-nums">
                  <span className="w-2 h-2 rounded-full bg-success-foreground animate-pulse" />
                  录音中({formatRecordingDuration(recordingSeconds)})
                </Badge>
                {lastSegmentAgeSec != null && lastSegmentAgeSec > 0 && (
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    上次转写 {lastSegmentAgeSec < 60 ? `${lastSegmentAgeSec} 秒` : `${Math.floor(lastSegmentAgeSec / 60)} 分`}前
                  </span>
                )}
              </div>
            )}
            {status === "paused" && <Badge className="shrink-0">已暂停</Badge>}
            {status === "processing" && <Badge className="shrink-0">处理中</Badge>}
          </div>
        </CardHeader>

        <CardContent className="flex-1 min-h-0 px-4 pb-3 md:px-6 md:pb-4 flex flex-col gap-2">
          {status === "recording" && transcriptionWarning && (
            <p className="text-xs text-amber-600 dark:text-amber-400 leading-relaxed rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 shrink-0">
              {transcriptionWarning}
            </p>
          )}
          <ScrollArea className="h-full pr-3 md:pr-4 flex-1 min-h-0" ref={scrollRef}>
            {!hasContent ? (
              <div className="flex items-center justify-center min-h-[4rem] h-full text-muted-foreground">
                <p className="text-center text-sm">
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

      {/* 桌面端：按钮在转录卡片下方；移动端由 MobilePromoteBar 负责 */}
      <div className="hidden md:flex shrink-0 pt-2">
        <DashboardDraftActions className="w-full" />
      </div>
    </div>
  );
}
