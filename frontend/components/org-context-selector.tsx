'use client';

import { useEffect, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRecordingStore } from '@/lib/store';
import { fetchUserOrgs, type UserOrg } from '@/lib/user-orgs';

export function OrgContextSelector() {
  const { activeOrgId, setActiveOrgId } = useRecordingStore();
  const [orgs, setOrgs] = useState<UserOrg[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void fetchUserOrgs()
      .then((data) => {
        if (cancelled) return;
        setOrgs(data);
        // 自动选择默认组织
        if (!activeOrgId) {
          const def = data.find((o) => o.isDefault);
          if (def) setActiveOrgId(def.organizationId);
        }
      })
      .catch(() => {
        // 静默失败 — 无组织时仅显示「不关联」
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 没有组织时隐藏选择器
  if (!loading && orgs.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground whitespace-nowrap">身份</span>
      <Select
        value={activeOrgId || '__none__'}
        onValueChange={(val) => setActiveOrgId(val === '__none__' ? null : val)}
        disabled={loading}
      >
        <SelectTrigger className="h-8 text-xs w-[180px]">
          <SelectValue placeholder={loading ? '加载中…' : '不关联组织'} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">
            <span className="text-muted-foreground">不关联组织</span>
          </SelectItem>
          {orgs.map((org) => (
            <SelectItem key={org.organizationId} value={org.organizationId}>
              <span>
                {org.name}
                {org.jobTitle ? ` · ${org.jobTitle}` : ''}
                {org.isDefault ? '（默认）' : ''}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
