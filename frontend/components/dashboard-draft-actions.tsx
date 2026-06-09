'use client';

import { useState, useCallback } from 'react';
import { GenerateMeetingSummaryButton } from '@/components/generate-meeting-summary-button';
import { PromoteDraftButton } from '@/components/promote-draft-button';
import { SummaryTemplateSelect } from '@/components/summary-template-select';

type DashboardDraftActionsProps = {
  className?: string;
};

/** 录音页：模板选择 + 生成会议纪要 + 保存为正式会话 */
export function DashboardDraftActions({
  className,
}: DashboardDraftActionsProps) {
  const [templateId, setTemplateId] = useState('');
  const handleTemplateChange = useCallback((id: string) => {
    setTemplateId(id);
  }, []);

  const buttonClass = 'flex-1 min-w-0 text-sm md:flex-none md:text-base';

  return (
    <div className={`space-y-2 w-full md:w-auto ${className ?? ''}`}>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">纪要模板</span>
        <SummaryTemplateSelect
          value={templateId}
          onValueChange={(id) => handleTemplateChange(id)}
          className="flex-1 md:w-[200px]"
        />
      </div>
      <div
        className="flex flex-row items-center gap-2 w-full md:w-auto md:justify-end"
      >
        <GenerateMeetingSummaryButton
          className={buttonClass}
          templateId={templateId || undefined}
        />
        <PromoteDraftButton className={buttonClass} />
      </div>
    </div>
  );
}
