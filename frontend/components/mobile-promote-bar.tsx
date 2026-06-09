'use client';

import { usePathname } from 'next/navigation';
import { DashboardDraftActions } from '@/components/dashboard-draft-actions';
import { useCanPromote } from '@/hooks/use-can-promote';

/** 移动端底栏：作为 shell 的 flex 子项，避免 WebView 裁切 fixed/portal */
export function MobilePromoteBar() {
  const pathname = usePathname();
  const { canPromote, hasContent, status } = useCanPromote();

  if (!pathname?.startsWith('/dashboard')) return null;

  return (
    <div className="shrink-0 border-t border-border bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden">
      {canPromote ? (
        <DashboardDraftActions className="w-full" />
      ) : (
        <p className="text-center text-xs text-muted-foreground leading-relaxed">
          {status === 'recording'
            ? '录音中，停止录音后可生成纪要或保存为正式会话'
            : hasContent
              ? '处理中，请稍候…'
              : '开始录音并产生转录后，可在此生成纪要或保存为正式会话'}
        </p>
      )}
    </div>
  );
}
