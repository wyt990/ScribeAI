'use client';

import { useEffect, useState } from 'react';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useRecordingStore } from '@/lib/store';
import { formatGainLabel } from '@/lib/audio-settings';
import { useAppConfig } from '@/hooks/use-app-config';
import {
  getPreferredCaptureMode,
  nativeRetryNoiseSuppression,
  type NativeLevelPayload,
} from '@/lib/native-recording';
import { cn } from '@/lib/utils';

type AudioGainControlProps = {
  disabled?: boolean;
};

export function AudioGainControl({ disabled = false }: AudioGainControlProps) {
  const { showAudioEnhancementPanel, audioGain: gainConfig } = useAppConfig();
  const {
    status,
    audioMode,
    audioGain,
    autoGainEnabled,
    noiseSuppressionEnabled,
    setAudioGain,
    setAutoGainEnabled,
    setNoiseSuppressionEnabled,
    setTranscriptionWarning,
  } = useRecordingStore();

  const isRecording = status === 'recording' || status === 'paused';
  const isNativeShell = getPreferredCaptureMode() === 'native';
  const controlsDisabled = disabled || (isRecording && !isNativeShell);
  const gainSliderReadOnly = autoGainEnabled;

  const [nativeLevelStatus, setNativeLevelStatus] = useState<NativeLevelPayload | null>(null);

  useEffect(() => {
    if (!isNativeShell) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<NativeLevelPayload>).detail;
      if (detail) setNativeLevelStatus(detail);
    };
    window.addEventListener('scribeai-native-level', handler);
    return () => window.removeEventListener('scribeai-native-level', handler);
  }, [isNativeShell]);

  const handleRetryDenoise = () => {
    const ok = nativeRetryNoiseSuppression();
    if (!ok) {
      setTranscriptionWarning('DTLN 降噪重试失败，请检查模型文件是否已打包进 APK');
    } else {
      setTranscriptionWarning(null);
    }
  };

  const showDtlmFailure =
    isNativeShell &&
    noiseSuppressionEnabled &&
    nativeLevelStatus?.noiseSuppressionError &&
    !nativeLevelStatus.noiseSuppressionActive;

  if (!showAudioEnhancementPanel) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">音频增强</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <Label htmlFor="auto-gain" className="text-sm font-medium">
              自动增益
            </Label>
            <p className="text-xs text-muted-foreground">
              根据输入音量自动调节，适合不熟悉手动调节的用户
            </p>
          </div>
          <Switch
            id="auto-gain"
            checked={autoGainEnabled}
            onCheckedChange={setAutoGainEnabled}
            disabled={controlsDisabled}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-sm font-medium">
              {autoGainEnabled ? '当前增益' : '手动增益'}
            </Label>
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatGainLabel(audioGain)}
            </span>
          </div>
          <Slider
            min={gainConfig.min}
            max={gainConfig.max}
            step={gainConfig.step}
            value={[audioGain]}
            onValueChange={gainSliderReadOnly ? undefined : ([v]) => setAudioGain(v)}
            disabled={controlsDisabled}
            className={cn(gainSliderReadOnly && 'pointer-events-none opacity-90')}
            aria-label={gainSliderReadOnly ? '当前增益（自动）' : '音量增益'}
            aria-readonly={gainSliderReadOnly}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>0（静音）</span>
            <span>1（标准）</span>
            <span>3（最大）</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <Label htmlFor="noise-suppression" className="text-sm font-medium">
              AI 降噪
            </Label>
            <p className="text-xs text-muted-foreground">
              {isNativeShell
                ? '壳内使用 DTLN 深度学习降噪（ONNX，录音中可实时调节）'
                : audioMode === 'tab'
                ? '标签页音频建议关闭，麦克风模式效果更佳'
                : 'RNNoise 降噪，提升小声说话识别率'}
            </p>
          </div>
          <Switch
            id="noise-suppression"
            checked={noiseSuppressionEnabled}
            onCheckedChange={setNoiseSuppressionEnabled}
            disabled={controlsDisabled}
          />
        </div>

        {showDtlmFailure && (
          <div className="flex items-start gap-2 flex-wrap rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
            <p className="text-xs text-amber-700 dark:text-amber-400 flex-1 min-w-0">
              AI 降噪未生效：{nativeLevelStatus!.noiseSuppressionError}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs shrink-0"
              onClick={handleRetryDenoise}
            >
              重试降噪
            </Button>
          </div>
        )}

        {isRecording && !isNativeShell && (
          <p className="text-xs text-muted-foreground">
            录音中无法修改音频设置，停止后可调整
          </p>
        )}
        {isRecording && isNativeShell && (
          <p className="text-xs text-muted-foreground">
            壳内录音中可实时调节；音量条反映增强后的电平
          </p>
        )}
      </CardContent>
    </Card>
  );
}
