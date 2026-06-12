'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  createSummaryTemplate,
  generateTemplateDraft,
  type TemplateDraft,
} from '@/lib/summary-templates';
import { useAppDialog } from '@/hooks/use-app-dialog';
import { localizeError } from '@/lib/localize-error';

export default function NewSummaryTemplatePage() {
  const router = useRouter();
  const { alert, dialogUi } = useAppDialog();
  const [description, setDescription] = useState('');
  const [exampleMd, setExampleMd] = useState('');
  const [draft, setDraft] = useState<TemplateDraft | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const handleGenerate = async () => {
    if (!description.trim() && !exampleMd.trim()) {
      setFormError('请填写模板描述或粘贴范例纪要');
      return;
    }
    setFormError('');
    setGenerating(true);
    try {
      const result = await generateTemplateDraft(description, exampleMd);
      setDraft(result);
    } catch (err) {
      await alert(localizeError(err instanceof Error ? err.message : '生成失败'));
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async (asDefault: boolean) => {
    if (!draft) return;
    setSaving(true);
    try {
      const { template } = await createSummaryTemplate({ ...draft, setAsDefault: asDefault });
      router.push(`/settings/summary-templates/${template.id}`);
    } catch (err) {
      await alert(localizeError(err instanceof Error ? err.message : '保存失败'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/settings/summary-templates">返回</Link>
        </Button>
        <h1 className="text-xl font-semibold">AI 生成纪要模板</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">描述需求</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {formError && <p className="text-sm text-destructive">{formError}</p>}
          <Textarea
            placeholder="例如：教务处周例会，要有议题、决议、待办、责任处室…"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              if (formError) setFormError('');
            }}
            rows={4}
          />
          <Textarea
            placeholder="可选：粘贴一份范例纪要，AI 将反推版式…"
            value={exampleMd}
            onChange={(e) => setExampleMd(e.target.value)}
            rows={8}
          />
          <Button onClick={() => void handleGenerate()} disabled={generating}>
            {generating ? 'AI 生成中…' : '生成模板草稿'}
          </Button>
        </CardContent>
      </Card>

      {draft && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">草稿预览（可修改后保存）</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <Textarea
              value={draft.description ?? ''}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              rows={2}
              placeholder="描述"
            />
            <label className="text-sm font-medium">整理规则</label>
            <Textarea
              value={draft.rulesMd}
              onChange={(e) => setDraft({ ...draft, rulesMd: e.target.value })}
              rows={6}
              className="font-mono text-sm"
            />
            <label className="text-sm font-medium">输出版式</label>
            <Textarea
              value={draft.outputMd}
              onChange={(e) => setDraft({ ...draft, outputMd: e.target.value })}
              rows={10}
              className="font-mono text-sm"
            />
            <label className="text-sm font-medium">工作流步骤（可选）</label>
            <Textarea
              value={draft.stepsMd ?? ''}
              onChange={(e) => setDraft({ ...draft, stepsMd: e.target.value })}
              rows={5}
              className="font-mono text-sm"
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void handleSave(false)} disabled={saving}>
                {saving ? '保存中…' : '保存模板'}
              </Button>
              <Button variant="outline" onClick={() => void handleSave(true)} disabled={saving}>
                保存并设为默认
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {dialogUi}
    </div>
  );
}
