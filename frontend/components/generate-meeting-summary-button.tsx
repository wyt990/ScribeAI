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
import { OrgIdentityModal, promptOrgIdentityIfNeeded } from '@/components/org-identity-modal';
import type { SummaryTemplateItem } from '@/lib/summary-templates';
import { useAppDialog } from '@/hooks/use-app-dialog';
import { localizeError } from '@/lib/localize-error';
import { SUMMARY_GENERATION_HINT } from '@/lib/summary-timing';

type GenerateMeetingSummaryButtonProps = {
  className?: string;
  templateId?: string;
};

export function GenerateMeetingSummaryButton({
  className,
  templateId: externalTemplateId,
}: GenerateMeetingSummaryButtonProps) {
  const router = useRouter();
  const { alert, dialogUi } = useAppDialog();
  const { flushDraft } = useDraftSync();
  const { canPromote } = useCanPromote();
  const { draftId, clearTranscript, clearDraft } = useRecordingStore();
  const [loading, setLoading] = useState(false);

  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [pendingTemplates, setPendingTemplates] = useState<SummaryTemplateItem[]>([]);
  const [pendingDefaultId, setPendingDefaultId] = useState('');

  const [showOrgModal, setShowOrgModal] = useState(false);
  const [pendingTemplateId, setPendingTemplateId] = useState('');
  const [orgDefaultId, setOrgDefaultId] = useState<string | null>(null);

  const doGenerate = async (effectiveTemplateId: string, orgId: string | null) => {
    if (!draftId || !canPromote || loading) return;

    setLoading(true);
    try {
      await promoteDraftAndGenerateSummary({
        draftId,
        flushDraft,
        templateId: effectiveTemplateId,
        orgId,
        router,
      });
      clearTranscript();
      clearDraft();
    } catch (err) {
      console.error(err);
      await alert(localizeError(err instanceof Error ? err.message : '生成会议纪要失败'));
    } finally {
      setLoading(false);
    }
  };

  const proceedWithOrgSelection = async (effectiveTemplateId: string) => {
    const { needed, orgId } = await promptOrgIdentityIfNeeded(null);
    if (!needed) {
      await doGenerate(effectiveTemplateId, null);
      return;
    }
    setPendingTemplateId(effectiveTemplateId);
    setOrgDefaultId(orgId);
    setShowOrgModal(true);
  };

  const handleClick = async () => {
    if (!draftId || !canPromote || loading) return;

    if (externalTemplateId) {
      await proceedWithOrgSelection(externalTemplateId);
      return;
    }

    try {
      const resolved = await resolveSummaryTemplate();

      if (resolved.needsSelection && resolved.templates) {
        setPendingTemplates(resolved.templates);
        setPendingDefaultId(resolved.templateId);
        setShowTemplateModal(true);
        return;
      }

      await proceedWithOrgSelection(resolved.templateId);
    } catch (err) {
      console.error(err);
      await alert(localizeError(err instanceof Error ? err.message : '获取模板信息失败'));
    }
  };

  const handleTemplateConfirm = async (selectedTemplateId: string) => {
    setShowTemplateModal(false);
    await proceedWithOrgSelection(selectedTemplateId);
  };

  const handleTemplateCancel = () => {
    setShowTemplateModal(false);
  };

  const handleOrgConfirm = async (orgId: string | null) => {
    setShowOrgModal(false);
    await doGenerate(pendingTemplateId, orgId);
  };

  const handleOrgCancel = () => {
    setShowOrgModal(false);
  };

  return (
    <>
      <Button
        className={className}
        variant="default"
        onClick={() => void handleClick()}
        disabled={!canPromote || loading}
      >
        {loading ? `生成中（${SUMMARY_GENERATION_HINT}）...` : '生成会议纪要'}
      </Button>

      <TemplateSelectModal
        open={showTemplateModal}
        templates={pendingTemplates}
        defaultTemplateId={pendingDefaultId}
        onConfirm={(id) => void handleTemplateConfirm(id)}
        onCancel={handleTemplateCancel}
      />

      <OrgIdentityModal
        open={showOrgModal}
        defaultOrgId={orgDefaultId}
        onConfirm={(orgId) => void handleOrgConfirm(orgId)}
        onCancel={handleOrgCancel}
      />

      {dialogUi}
    </>
  );
}
