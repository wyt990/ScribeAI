'use client';

import { ManagerSettingsForm } from '@/components/manager-settings-form';

export default function ManagerStorageSettingsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">存储与清理</h1>
      <ManagerSettingsForm group="storage" />
    </div>
  );
}
