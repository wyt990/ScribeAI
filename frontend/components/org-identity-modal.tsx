'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  OrgIdentitySelect,
  loadUserOrgs,
  resolveDefaultOrgId,
} from '@/components/org-identity-select';

type OrgIdentityModalProps = {
  open: boolean;
  defaultOrgId?: string | null;
  title?: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: (orgId: string | null) => void;
  onCancel: () => void;
};

export function OrgIdentityModal({
  open,
  defaultOrgId = null,
  title = '选择生成身份',
  description = '选择您在本次会议中的组织身份，AI 将据此标记与您职责相关的内容。',
  confirmLabel = '确认生成',
  onConfirm,
  onCancel,
}: OrgIdentityModalProps) {
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(defaultOrgId);
  const [hasOrgs, setHasOrgs] = useState(true);
  const [loading, setLoading] = useState(true);
  const confirmedRef = useRef(false);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoading(true);
    void loadUserOrgs()
      .then((orgs) => {
        if (cancelled) return;
        setHasOrgs(orgs.length > 0);
        setSelectedOrgId(resolveDefaultOrgId(orgs, defaultOrgId));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, defaultOrgId]);

  if (!open || (!loading && !hasOrgs)) return null;

  const handleConfirm = () => {
    confirmedRef.current = true;
    onConfirm(selectedOrgId);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          if (!confirmedRef.current) onCancel();
          confirmedRef.current = false;
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <OrgIdentitySelect
          value={selectedOrgId}
          onValueChange={setSelectedOrgId}
          disabled={loading}
          className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center"
          triggerClassName="h-9 text-sm w-full"
        />

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            取消
          </Button>
          <Button onClick={handleConfirm} disabled={loading}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 若用户有组织则弹出身份选择，否则直接返回 null */
export async function promptOrgIdentityIfNeeded(
  defaultOrgId?: string | null
): Promise<{ needed: boolean; orgId: string | null }> {
  const orgs = await loadUserOrgs();
  if (orgs.length === 0) {
    return { needed: false, orgId: null };
  }
  return {
    needed: true,
    orgId: resolveDefaultOrgId(orgs, defaultOrgId),
  };
}
