'use client';

import { Mic, Monitor } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useRecordingStore, AudioMode } from '@/lib/store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { APP_CONFIG } from '@/lib/app-config';

export function AudioModeSelector() {
  const { audioMode, setAudioMode, status } = useRecordingStore();

  if (!APP_CONFIG.showAudioSource) return null;
  const isDisabled = status !== 'idle';

  const handleModeChange = (value: string) => {
    setAudioMode(value as AudioMode);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>音频源</CardTitle>
        <CardDescription>
          选择录音输入源
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup
          value={audioMode}
          onValueChange={handleModeChange}
          disabled={isDisabled}
          className="grid grid-cols-2 gap-4"
        >
          <div>
            <RadioGroupItem
              value="mic"
              id="mic"
              className="peer sr-only"
            />
            <Label
              htmlFor="mic"
              className="flex flex-col items-center justify-between rounded-lg border-2 border-muted bg-card p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
            >
              <Mic className="w-6 h-6 mb-3" />
              <div className="text-center">
                <div className="font-semibold">麦克风</div>
                <div className="text-xs text-muted-foreground mt-1">
                  录制麦克风音频
                </div>
              </div>
            </Label>
          </div>

          <div>
            <RadioGroupItem
              value="tab"
              id="tab"
              className="peer sr-only"
            />
            <Label
              htmlFor="tab"
              className="flex flex-col items-center justify-between rounded-lg border-2 border-muted bg-card p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
            >
              <Monitor className="w-6 h-6 mb-3" />
              <div className="text-center">
                <div className="font-semibold">标签页音频</div>
                <div className="text-xs text-muted-foreground mt-1">
                  录制标签页音频
                </div>
              </div>
            </Label>
          </div>
        </RadioGroup>
      </CardContent>
    </Card>
  );
}
