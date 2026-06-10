'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useCanPromote } from '@/hooks/use-can-promote';
import { useDraftSync } from '@/hooks/use-draft-sync';
import { useRecordingStore } from '@/lib/store';
import { promoteDraftAndGenerateSummary } from '@/lib/promote-and-summarize';
import { resolveSummaryTemplate } from '@/lib/resolve-summary-template';
import { TemplateSelectModal } from '@/components/template-select-modal';
import type { SummaryTemplateItem } from '@/lib/summary-templates';

type GenerateMeetingSummaryButtonProps = {
  className?: string;
  templateId?: string;
};

export function GenerateMeetingSummaryButton({
  className,
  templateId: externalTemplateId,
}: GenerateMeetingSummaryButtonProps) {
  const router = useRouter();
  const { flushDraft } = useDraftSync();
  const { canPromote } = useCanPromote();
  const { draftId, clearTranscript, clearDraft } = useRecordingStore();
  const [loading, setLoading] = useState(false);

  // 模板选择弹窗状态
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [pendingTemplates, setPendingTemplates] = useState<SummaryTemplateItem[]>([]);
  const [pendingDefaultId, setPendingDefaultId] = useState('');

  /** 执行生成流程（模板已确定后） */
  const doGenerate = async (effectiveTemplateId: string) => {
    if (!draftId || !canPromote || loading) return;

    setLoading(true);
    try {
      await promoteDraftAndGenerateSummary({
        draftId,
        flushDraft,
        templateId: effectiveTemplateId,
        router,
      });
      clearTranscript();
      clearDraft();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : '生成会议纪要失败');
    } finally {
      setLoading(false);
    }
  };

  const handleClick = async () => {
    if (!draftId || !canPromote || loading) return;

    // 如果外部已指定 templateId，直接使用
    if (externalTemplateId) {
      await doGenerate(externalTemplateId);
      return;
    }

    try {
      const resolved = await resolveSummaryTemplate();

      if (resolved.needsSelection && resolved.templates) {
        // 2+ 自定义模板 → 弹窗让用户选择
        setPendingTemplates(resolved.templates);
        setPendingDefaultId(resolved.templateId);
        setShowTemplateModal(true);
        return;
      }

      // 无需选择，直接使用解析结果
      await doGenerate(resolved.templateId);
    } catch (err) {
      console.error(err);
      alert('获取模板信息失败');
    }
  };

  const handleTemplateConfirm = async (selectedTemplateId: string) => {
    setShowTemplateModal(false);
    await doGenerate(selectedTemplateId);
  };

  const handleTemplateCancel = () => {
    setShowTemplateModal(false);
  };

  return (
    <>
      <Button
        className={className}
        variant="default"
        onClick={() => void handleClick()}
        disabled={!canPromote || loading}
      >
        {loading ? '生成中（约 1–3 分钟）...' : '生成会议纪要'}
      </Button>

      <TemplateSelectModal
        open={showTemplateModal}
        templates={pendingTemplates}
        defaultTemplateId={pendingDefaultId}
        onConfirm={(id) => void handleTemplateConfirm(id)}
        onCancel={handleTemplateCancel}
      />
    </>
  );
}
