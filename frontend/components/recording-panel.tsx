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
import { useAppDialog } from '@/hooks/use-app-dialog';
import { localizeError } from '@/lib/localize-error';

type RecordingPanelProps = {
  scope: RecordingScope;
  id: string;
  manager?: boolean;
  onRetranscribed?: (fullText: string) => void;
};

export function RecordingPanel({ scope, id, manager, onRetranscribed }: RecordingPanelProps) {
  const { confirm, alert, dialogUi } = useAppDialog();
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
        if (!cancelled) {
          setError(localizeError(err instanceof Error ? err.message : '加载失败'));
        }
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
      setError(localizeError(err instanceof Error ? err.message : '试听加载失败'));
    } finally {
      setLoadingAudio(false);
    }
  };

  const handleRetranscribe = async () => {
    const label = scope === 'sessions' ? '正式会话' : '草稿';
    const ok = await confirm(
      `将使用当前 STT 配置对归档录音重新转写，并覆盖${label}中的转录文本。是否继续？`,
      { title: '重新转写', confirmLabel: '开始转写' }
    );
    if (!ok) return;

    setRetranscribing(true);
    setError('');
    try {
      const result = await retranscribeRecording(scope, id, manager);
      onRetranscribed?.(result.fullText);
      await alert(`重跑 ASR 完成（耗时 ${Math.round(result.durationMs / 1000)} 秒）`, '转写完成');
    } catch (err) {
      setError(localizeError(err instanceof Error ? err.message : '重跑 ASR 失败'));
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
          {meta.finalized ? ' · 已完成' : ' · 录音进行中'}
          {(meta.segmentCount ?? 0) > 1 ? ` · ${meta.segmentCount} 段` : ''}
        </span>
      </div>

      {meta.finalizedAt && (
        <p className="text-xs text-muted-foreground">
          归档时间：{new Date(meta.finalizedAt).toLocaleString()}
        </p>
      )}

      {!meta.finalized && (
        <p className="text-xs text-muted-foreground">
          请先停止录音后再试听或重跑 ASR。
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loadingAudio || !meta.finalized}
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
          disabled={retranscribing || !meta.finalized}
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

      {dialogUi}
    </div>
  );
}
