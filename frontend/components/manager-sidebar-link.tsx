'use client';

import Link from 'next/link';
import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIsManager } from '@/hooks/use-is-manager';

type ManagerSidebarLinkProps = {
  onNavigate?: () => void;
  className?: string;
};

/** 侧栏/抽屉底部：系统设置入口（仅 manager） */
export function ManagerSidebarLink({ onNavigate, className }: ManagerSidebarLinkProps) {
  const { isManager, loading } = useIsManager();
  if (loading || !isManager) return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      className={className ?? 'w-full justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent'}
      asChild
    >
      <Link href="/manager" onClick={onNavigate}>
        <Settings className="w-5 h-5" />
        系统设置
      </Link>
    </Button>
  );
}
