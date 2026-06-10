'use client';

import { ManagerSettingsForm } from '@/components/manager-settings-form';

export default function ManagerSttSettingsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">语音识别 (STT / VAD)</h1>
      <p className="text-sm text-muted-foreground">修改后新连接的录音会话生效；部分项需重启后端完全生效。</p>
      <ManagerSettingsForm group="stt" />
    </div>
  );
}
