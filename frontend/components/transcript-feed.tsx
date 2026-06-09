"use client";

import { useEffect, useRef } from "react";
import { useRecordingStore } from "@/lib/store";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { PromoteDraftButton } from "@/components/promote-draft-button";

export function TranscriptFeed() {
  const { transcript, status, draftId, draftTitle } = useRecordingStore();
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
              <Badge className="bg-success text-success-foreground flex items-center gap-2 shrink-0">
                <span className="w-2 h-2 rounded-full bg-success-foreground animate-pulse" />
                录音中
              </Badge>
            )}
            {status === "paused" && <Badge className="shrink-0">已暂停</Badge>}
            {status === "processing" && <Badge className="shrink-0">处理中</Badge>}
          </div>
        </CardHeader>

        <CardContent className="flex-1 min-h-0 px-4 pb-3 md:px-6 md:pb-4">
          <ScrollArea className="h-full pr-3 md:pr-4" ref={scrollRef}>
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
      <div className="hidden md:flex shrink-0 justify-end pt-2">
        <PromoteDraftButton />
      </div>
    </div>
  );
}
