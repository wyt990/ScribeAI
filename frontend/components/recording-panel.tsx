'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  fetchRecordingMeta,
  formatRecordingSize,
  loadRecordingBlobUrl,
  retranscribeRecording,
  type RecordingMeta,
  type RecordingScope,
} from '@/lib/recording-api';

type RecordingPanelProps = {
  scope: RecordingScope;
  id: string;
  manager?: boolean;
  onRetranscribed?: (fullText: string) => void;
};

export function RecordingPanel({ scope, id, manager, onRetranscribed }: RecordingPanelProps) {
  const [meta, setMeta] = useState<RecordingMeta | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [retranscribing, setRetranscribing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setAudioUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });

    void fetchRecordingMeta(scope, id, manager)
      .then((m) => {
        if (!cancelled) setMeta(m);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [scope, id, manager]);

  useEffect(
    () => () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    },
    [audioUrl]
  );

  const handleLoadAudio = async () => {
    setLoadingAudio(true);
    setError('');
    try {
      setAudioUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      const url = await loadRecordingBlobUrl(scope, id, manager);
      setAudioUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : '试听加载失败');
    } finally {
      setLoadingAudio(false);
    }
  };

  const handleRetranscribe = async () => {
    const label = scope === 'sessions' ? '正式会话' : '草稿';
    if (
      !confirm(
        `将使用当前 STT 配置对归档录音重新转写，并覆盖${label}中的转录文本。是否继续？`
      )
    ) {
      return;
    }

    setRetranscribing(true);
    setError('');
    try {
      const result = await retranscribeRecording(scope, id, manager);
      onRetranscribed?.(result.fullText);
      alert(`重跑 ASR 完成（耗时 ${Math.round(result.durationMs / 1000)} 秒）`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '重跑 ASR 失败');
    } finally {
      setRetranscribing(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">检查录音归档…</p>;
  }

  if (!meta?.hasRecording) {
    return (
      <p className="text-sm text-muted-foreground">
        无归档录音（可能尚未停止录音、录音 ID 未关联，或文件已过期清理）。
      </p>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">归档录音</p>
        <span className="text-xs text-muted-foreground">
          {formatRecordingSize(meta.sizeBytes)}
          {meta.finalized ? ' · 已完成' : ' · 未完成'}
        </span>
      </div>

      {meta.finalizedAt && (
        <p className="text-xs text-muted-foreground">
          归档时间：{new Date(meta.finalizedAt).toLocaleString()}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loadingAudio}
          onClick={() => void handleLoadAudio()}
        >
          {loadingAudio ? (
            <>
              <Spinner className="size-3.5 mr-1" />
              加载中…
            </>
          ) : audioUrl ? (
            '重新加载试听'
          ) : (
            '加载试听'
          )}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={retranscribing}
          onClick={() => void handleRetranscribe()}
        >
          {retranscribing ? (
            <>
              <Spinner className="size-3.5 mr-1" />
              转写中…
            </>
          ) : (
            '重跑 ASR'
          )}
        </Button>
      </div>

      {audioUrl && (
        <audio controls className="w-full" src={audioUrl}>
          您的浏览器不支持音频播放。
        </audio>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
