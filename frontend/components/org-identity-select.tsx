'use client';

import { useEffect, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { fetchUserOrgs, type UserOrg } from '@/lib/user-orgs';

type OrgIdentitySelectProps = {
  value: string | null;
  onValueChange: (orgId: string | null) => void;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
};

export function OrgIdentitySelect({
  value,
  onValueChange,
  disabled = false,
  className,
  triggerClassName = 'h-8 text-xs w-full',
}: OrgIdentitySelectProps) {
  const [orgs, setOrgs] = useState<UserOrg[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void fetchUserOrgs()
      .then((data) => {
        if (!cancelled) setOrgs(data);
      })
      .catch(() => {
        if (!cancelled) setOrgs([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loading && orgs.length === 0) return null;

  return (
    <div className={className ?? 'flex items-center gap-2'}>
      <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">身份</span>
      <Select
        value={value || '__none__'}
        onValueChange={(val) => onValueChange(val === '__none__' ? null : val)}
        disabled={disabled || loading}
      >
        <SelectTrigger className={triggerClassName}>
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

/** 加载用户组织列表，供生成纪要前判断是否需要弹出身份选择 */
export async function loadUserOrgs(): Promise<UserOrg[]> {
  try {
    return await fetchUserOrgs();
  } catch {
    return [];
  }
}

/** 解析生成纪要时的默认组织身份 */
export function resolveDefaultOrgId(
  orgs: UserOrg[],
  preferredOrgId?: string | null
): string | null {
  if (preferredOrgId && orgs.some((o) => o.organizationId === preferredOrgId)) {
    return preferredOrgId;
  }
  return orgs.find((o) => o.isDefault)?.organizationId ?? null;
}
