'use client';

import { ManagerSettingsForm } from '@/components/manager-settings-form';

export default function ManagerSecuritySettingsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">安全与超时</h1>
      <p className="text-sm text-muted-foreground">JWT_SECRET 与 DATABASE_URL 不在此修改，请直接编辑服务器 .env。</p>
      <ManagerSettingsForm group="security" />
    </div>
  );
}
