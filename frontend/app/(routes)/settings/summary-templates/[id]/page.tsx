'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  exportSummaryTemplate,
  fetchSummaryTemplate,
  forkSummaryTemplate,
  previewSummaryTemplate,
  setDefaultSummaryTemplate,
  submitTemplateForPublic,
  updateSummaryTemplate,
  type SummaryTemplateDetail,
} from '@/lib/summary-templates';
import { SUMMARY_GENERATION_HINT } from '@/lib/summary-timing';
import { useAppDialog } from '@/hooks/use-app-dialog';
import { localizeError } from '@/lib/localize-error';

export default function EditSummaryTemplatePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { alert, dialogUi } = useAppDialog();

  const [data, setData] = useState<SummaryTemplateDetail | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rulesMd, setRulesMd] = useState('');
  const [stepsMd, setStepsMd] = useState('');
  const [outputMd, setOutputMd] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewText, setPreviewText] = useState('');
  const [sampleText, setSampleText] = useState('');

  const load = useCallback(async () => {
    const detail = await fetchSummaryTemplate(id);
    setData(detail);
    setName(detail.template.name);
    setDescription(detail.template.description ?? '');
    setRulesMd(detail.skill.rulesMd);
    setStepsMd(detail.skill.stepsMd ?? '');
    setOutputMd(detail.skill.outputMd);
  }, [id]);

  useEffect(() => {
    void load()
      .catch(async (err) => {
        console.error(err);
        await alert(localizeError(err instanceof Error ? err.message : '加载模板失败'));
      })
      .finally(() => setLoading(false));
  }, [load, alert]);

  const isReadonly = data?.template.isSystem ?? false;
  const isOwned = data && !data.template.isSystem;

  const handleSave = async () => {
    if (!isOwned) {
      await alert('系统模板不可直接编辑，请先「复制为我的模板」');
      return;
    }
    setSaving(true);
    try {
      await updateSummaryTemplate(id, {
        name,
        description,
        rulesMd,
        stepsMd,
        outputMd,
      });
      await load();
      await alert('已保存', '保存成功');
    } catch (err) {
      await alert(localizeError(err instanceof Error ? err.message : '保存失败'));
    } finally {
      setSaving(false);
    }
  };

  const handleFork = async () => {
    try {
      const { template } = await forkSummaryTemplate(id, `${name}（我的副本）`);
      router.push(`/settings/summary-templates/${template.id}`);
    } catch (err) {
      await alert(localizeError(err instanceof Error ? err.message : '复制失败'));
    }
  };

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      const res = await previewSummaryTemplate(id, sampleText || undefined);
      setPreviewText(res.preview);
    } catch (err) {
      await alert(localizeError(err instanceof Error ? err.message : '预览失败'));
    } finally {
      setPreviewing(false);
    }
  };

  const handleExport = async () => {
    try {
      const pack = await exportSummaryTemplate(id);
      const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name || 'template'}.skill.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      await alert(localizeError(err instanceof Error ? err.message : '导出失败'));
    }
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const pack = JSON.parse(text);
        const { createSummaryTemplate, importSummaryTemplate } = await import(
          '@/lib/summary-templates'
        );
        const result = pack?.format === 'scribeai-skill'
          ? await importSummaryTemplate(pack)
          : await createSummaryTemplate({
              name: pack.template?.name ?? '导入模板',
              rulesMd: pack.skill?.rulesMd ?? '',
              outputMd: pack.skill?.outputMd ?? '',
              stepsMd: pack.skill?.stepsMd,
              description: pack.template?.description,
            });
        router.push(`/settings/summary-templates/${result.template.id}`);
      } catch (err) {
        await alert(localizeError(err instanceof Error ? err.message : '导入失败'));
      }
    };
    input.click();
  };

  const handleSubmitPublic = async () => {
    try {
      await submitTemplateForPublic(id);
      await alert('已提交公共审核', '提交成功');
    } catch (err) {
      await alert(localizeError(err instanceof Error ? err.message : '提交失败'));
    }
  };

  if (loading) return <div className="p-6 text-muted-foreground">加载中…</div>;
  if (!data) return <div className="p-6 text-destructive">模板不存在</div>;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-3xl">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/settings/summary-templates">返回列表</Link>
        </Button>
        <h1 className="text-xl font-semibold truncate">{name}</h1>
        {isReadonly && (
          <span className="text-xs text-muted-foreground">（系统模板，只读）</span>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">基本信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isReadonly}
          />
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            disabled={isReadonly}
            placeholder="适用场景说明"
          />
          <div className="flex flex-wrap gap-2">
            {isReadonly ? (
              <Button onClick={() => void handleFork()}>复制系统模板</Button>
            ) : (
              <Button onClick={() => void handleSave()} disabled={saving}>
                {saving ? '保存中…' : '保存'}
              </Button>
            )}
            <Button variant="outline" onClick={() => void setDefaultSummaryTemplate(id)}>
              设为默认
            </Button>
            {isOwned && (
              <Button variant="outline" onClick={() => void handleSubmitPublic()}>
                申请公共共享
              </Button>
            )}
            <Button variant="outline" onClick={() => void handleExport()}>
              导出 .skill.json
            </Button>
            <Button variant="outline" onClick={handleImport}>
              导入
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">输出版式（outputMd）</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={outputMd}
            onChange={(e) => setOutputMd(e.target.value)}
            rows={14}
            className="font-mono text-sm"
            disabled={isReadonly}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">整理规则（rulesMd）</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={rulesMd}
            onChange={(e) => setRulesMd(e.target.value)}
            rows={10}
            className="font-mono text-sm"
            disabled={isReadonly}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">工作流步骤（stepsMd，高级）</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={stepsMd}
            onChange={(e) => setStepsMd(e.target.value)}
            rows={8}
            className="font-mono text-sm"
            disabled={isReadonly}
            placeholder="分步处理说明，将注入 LLM prompt…"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">试跑预览</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={sampleText}
            onChange={(e) => setSampleText(e.target.value)}
            rows={5}
            placeholder="粘贴短样例转录，留空则用内置示例…"
          />
          <Button onClick={() => void handlePreview()} disabled={previewing}>
            {previewing ? `生成预览中（${SUMMARY_GENERATION_HINT}）…` : '生成预览'}
          </Button>
          {previewText && (
            <pre className="text-sm whitespace-pre-wrap rounded border bg-muted/50 p-4 max-h-96 overflow-auto">
              {previewText}
            </pre>
          )}
        </CardContent>
      </Card>

      {dialogUi}
    </div>
  );
}
