'use client';

import { GenerateMeetingSummaryButton } from '@/components/generate-meeting-summary-button';
import { PromoteDraftButton } from '@/components/promote-draft-button';

type DashboardDraftActionsProps = {
  className?: string;
};

/** 录音页：生成会议纪要 + 保存为正式会话 */
export function DashboardDraftActions({
  className,
}: DashboardDraftActionsProps) {
  const buttonClass = 'flex-1 min-w-0 text-sm md:flex-none md:text-base';

  return (
    <div
      className={`flex flex-row items-center gap-2 w-full md:w-auto md:justify-end ${className ?? ''}`}
    >
      <GenerateMeetingSummaryButton className={buttonClass} />
      <PromoteDraftButton className={buttonClass} />
    </div>
  );
}
