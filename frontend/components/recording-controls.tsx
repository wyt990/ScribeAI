import { Play, Pause, Square, Loader2, Mic, MicOff, Loader } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useRecordingStore } from '@/lib/store';
import { useAudioRecorder } from '@/hooks/use-audio-recorder';
import { isIOSDevice } from '@/lib/screen-wake';

/** VAD 状态指示器：显示一个小圆点 + 文字 */
function VADBadge({ status, error }: { status: 'inactive' | 'loading' | 'ready' | 'error'; error?: string | null }) {
  const config = {
    inactive: { color: 'bg-gray-400', text: 'VAD 未启用', icon: MicOff },
    loading: { color: 'bg-yellow-400 animate-pulse', text: 'VAD 模型加载中...', icon: Loader },
    ready: { color: 'bg-green-500', text: 'VAD 已就绪', icon: Mic },
    error: { color: 'bg-red-500', text: 'VAD 不可用（使用定时兜底）', icon: MicOff },
  };
  const { color, text, icon: Icon } = config[status];

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className={`inline-block w-2 h-2 rounded-full ${color} shrink-0`} />
      <div className="flex flex-col">
        <span>{text}</span>
        {status === 'error' && error && (
          <span className="text-[10px] text-red-400 break-all">错误: {error}</span>
        )}
      </div>
    </div>
  );
}

const METER_SEGMENTS = 28;

/** 分段式音量指示器：绿 → 黄 → 红，仅在录音时显示 */
function VolumeMeter({ level }: { level: number }) {
  const activeCount = Math.round(level * METER_SEGMENTS);

  return (
    <div
      className="flex w-full gap-[2px] h-2 mt-0.5"
      role="meter"
      aria-label="录音音量"
      aria-valuenow={Math.round(level * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {Array.from({ length: METER_SEGMENTS }, (_, i) => {
        const isActive = i < activeCount;
        const ratio = i / METER_SEGMENTS;
        let color = 'bg-muted/25';
        if (isActive) {
          if (ratio < 0.55) color = 'bg-emerald-500';
          else if (ratio < 0.8) color = 'bg-amber-400';
          else color = 'bg-red-500';
        }
        return (
          <div
            key={i}
            className={`flex-1 rounded-[2px] transition-colors duration-75 ${color}`}
          />
        );
      })}
    </div>
  );
}

type RecordingControlsProps = {
  ensureDraft?: () => Promise<string | null>;
  flushDraft?: () => Promise<void>;
};

export function RecordingControls({ ensureDraft, flushDraft }: RecordingControlsProps) {
  const { status, recordingInterrupted } = useRecordingStore();
  const {
    startRecording,
    pauseRecording,
    resumeRecording,
    recoverRecording,
    stopRecording,
    isReady,
    isConnecting,
    isRecovering,
    vadStatus,
    vadError,
    vadLoading,
    audioLevel,
  } = useAudioRecorder({ ensureDraft, flushDraft });

  const isIdle = status === 'idle';
  const isRecording = status === 'recording';
  const isPaused = status === 'paused';
  const isProcessing = status === 'processing';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="shrink-0">录音控制</CardTitle>
          <VADBadge status={vadStatus} error={vadError} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3 flex-wrap">
          {isIdle && (
            <Button
              size="lg"
              className="flex-1"
              onClick={startRecording}
              disabled={!isReady || isConnecting || vadLoading || vadStatus === 'loading'}
            >
              {isConnecting ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  连接中...
                </>
              ) : vadLoading || vadStatus === 'loading' ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  VAD 加载中...
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 mr-2" />
                  开始录音
                </>
              )}
            </Button>
          )}

          {isRecording && (
            <>
              <Button variant="outline" size="lg" className="flex-1" onClick={pauseRecording}>
                <Pause className="w-5 h-5 mr-2" />
                暂停
              </Button>
              <Button variant="destructive" size="lg" className="flex-1" onClick={stopRecording}>
                <Square className="w-5 h-5 mr-2" />
                停止
              </Button>
            </>
          )}

          {isPaused && !recordingInterrupted && (
            <>
              <Button size="lg" className="flex-1" onClick={resumeRecording}>
                <Play className="w-5 h-5 mr-2" />
                恢复
              </Button>
              <Button variant="destructive" size="lg" className="flex-1" onClick={stopRecording}>
                <Square className="w-5 h-5 mr-2" />
                停止
              </Button>
            </>
          )}

          {isPaused && recordingInterrupted && (
            <Button variant="destructive" size="lg" className="flex-1" onClick={stopRecording}>
              <Square className="w-5 h-5 mr-2" />
              停止录音
            </Button>
          )}

          {isProcessing && (
            <Button disabled size="lg" className="flex-1">
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              处理中...
            </Button>
          )}
        </div>

        {isRecording && <VolumeMeter level={audioLevel} />}

        {(isRecording || isPaused) && isIOSDevice() && (
          <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
            iPhone 可能仍会按系统自动锁定熄屏。建议：设置 → 显示与亮度 → 自动锁定 → 永不（或较长时间），并关闭低电量模式；录音时尽量保持本页在前台。
          </p>
        )}
      </CardContent>

      <AlertDialog open={recordingInterrupted}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>录音已中断</AlertDialogTitle>
            <AlertDialogDescription>
              录音已被系统中断（如来电抢占麦克风）。挂断后请点击「继续录音」重新获取麦克风，此前已转写的内容会保留在同一会话中。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={stopRecording}>停止录音</AlertDialogCancel>
            <AlertDialogAction
              disabled={isRecovering || !isReady || vadLoading}
              onClick={(e) => {
                e.preventDefault();
                void recoverRecording();
              }}
            >
              {isRecovering ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  正在恢复...
                </>
              ) : (
                '继续录音'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
