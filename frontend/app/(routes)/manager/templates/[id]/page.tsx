'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { fetchSummaryTemplate } from '@/lib/summary-templates';
import { managerApi } from '@/lib/manager-api';
import { useAppDialog } from '@/hooks/use-app-dialog';
import { localizeError } from '@/lib/localize-error';

export default function ManagerTemplateSkillPage() {
  const params = useParams();
  const id = params.id as string;
  const { alert, dialogUi } = useAppDialog();
  const [name, setName] = useState('');
  const [rulesMd, setRulesMd] = useState('');
  const [stepsMd, setStepsMd] = useState('');
  const [outputMd, setOutputMd] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetchSummaryTemplate(id).then((d) => {
      setName(d.template.name);
      setRulesMd(d.skill.rulesMd);
      setStepsMd(d.skill.stepsMd ?? '');
      setOutputMd(d.skill.outputMd);
    });
  }, [id]);

  const save = async () => {
    setSaving(true);
    try {
      await managerApi.templates.updateSkill(id, { name, rulesMd, stepsMd, outputMd });
      await alert('已保存', '保存成功');
    } catch (err) {
      await alert(localizeError(err instanceof Error ? err.message : '保存失败'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/manager/templates">← 返回列表</Link>
      </Button>
      <h1 className="text-2xl font-semibold">编辑 Skill：{name}</h1>
      <div className="space-y-1">
        <label className="text-sm font-medium">整理规则 (rulesMd)</label>
        <Textarea className="font-mono text-sm min-h-[160px]" value={rulesMd} onChange={(e) => setRulesMd(e.target.value)} />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">工作流步骤 (stepsMd)</label>
        <Textarea className="font-mono text-sm min-h-[120px]" value={stepsMd} onChange={(e) => setStepsMd(e.target.value)} />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">输出版式 (outputMd)</label>
        <Textarea className="font-mono text-sm min-h-[200px]" value={outputMd} onChange={(e) => setOutputMd(e.target.value)} />
      </div>
      <Button onClick={() => void save()} disabled={saving}>{saving ? '保存中…' : '保存'}</Button>

      {dialogUi}
    </div>
  );
}
