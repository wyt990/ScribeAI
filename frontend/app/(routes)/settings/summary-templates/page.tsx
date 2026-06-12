'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  deleteSummaryTemplate,
  fetchSummaryTemplates,
  forkSummaryTemplate,
  setDefaultSummaryTemplate,
  type SummaryTemplateItem,
} from '@/lib/summary-templates';
import { useAppDialog } from '@/hooks/use-app-dialog';
import { localizeError } from '@/lib/localize-error';

export default function SummaryTemplatesPage() {
  const router = useRouter();
  const { confirm, alert, dialogUi } = useAppDialog();
  const [templates, setTemplates] = useState<SummaryTemplateItem[]>([]);
  const [defaultId, setDefaultId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    setError(null);
    const data = await fetchSummaryTemplates();
    setTemplates(data.templates);
    setDefaultId(data.defaultTemplateId);
  };

  useEffect(() => {
    void reload()
      .catch((err) => {
        console.error(err);
        setError(localizeError(err instanceof Error ? err.message : '加载模板列表失败'));
      })
      .finally(() => setLoading(false));
  }, []);

  const handleFork = async (id: string) => {
    try {
      const { template } = await forkSummaryTemplate(id);
      router.push(`/settings/summary-templates/${template.id}`);
    } catch (err) {
      await alert(localizeError(err instanceof Error ? err.message : '复制失败'));
    }
  };

  const handleDefault = async (id: string) => {
    try {
      await setDefaultSummaryTemplate(id);
      await reload();
    } catch (err) {
      await alert(localizeError(err instanceof Error ? err.message : '设置失败'));
    }
  };

  const handleDelete = async (t: SummaryTemplateItem) => {
    if (t.isSystem) return;
    const ok = await confirm(`确定删除模板「${t.name}」？`, {
      title: '删除模板',
      confirmLabel: '删除',
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteSummaryTemplate(t.id);
      await reload();
    } catch (err) {
      await alert(localizeError(err instanceof Error ? err.message : '删除失败'));
    }
  };

  const systemTemplates = templates.filter((t) => t.isSystem);
  const myTemplates = templates.filter((t) => !t.isSystem);

  if (loading) {
    return <div className="p-6 text-muted-foreground">加载中…</div>;
  }

  const renderTemplateCard = (t: SummaryTemplateItem) => (
    <Card key={t.id}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex flex-wrap items-center gap-2">
          {t.name}
          {t.isDefault && (
            <span className="text-xs font-normal rounded-full bg-primary/10 text-primary px-2 py-0.5">
              默认
            </span>
          )}
          {t.isSystem && (
            <span className="text-xs font-normal text-muted-foreground">系统内置</span>
          )}
          {t.isPublic && t.reviewStatus === 'approved' && (
            <span className="text-xs font-normal text-muted-foreground">公共</span>
          )}
        </CardTitle>
        {t.description && <CardDescription>{t.description}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/settings/summary-templates/${t.id}`}>
            {t.isSystem ? '查看' : '编辑'}
          </Link>
        </Button>
        {t.isSystem ? (
          <Button size="sm" onClick={() => void handleFork(t.id)}>
            复制系统模板
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={() => void handleFork(t.id)}>
            复制为我的模板
          </Button>
        )}
        {!t.isDefault && (
          <Button variant="outline" size="sm" onClick={() => void handleDefault(t.id)}>
            设为默认
          </Button>
        )}
        {!t.isSystem && (
          <Button
            variant="outline"
            size="sm"
            className="text-destructive"
            onClick={() => void handleDelete(t)}
          >
            删除
          </Button>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">纪要模板</h1>
          <p className="text-sm text-muted-foreground mt-1">
            从系统模板复制一份到「我的模板」，即可自定义纪要版式与工作流。
          </p>
        </div>
        <Button asChild>
          <Link href="/settings/summary-templates/new">新建 / AI 生成</Link>
        </Button>
      </div>

      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6 space-y-3">
            <p className="text-sm text-destructive">{error}</p>
            <p className="text-xs text-muted-foreground">
              若刚部署新功能，请确认后端已执行数据库迁移（summary_templates）并重启服务。
            </p>
            <Button variant="outline" size="sm" onClick={() => void reload()}>
              重试
            </Button>
          </CardContent>
        </Card>
      )}

      {!error && systemTemplates.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">系统模板</h2>
          <p className="text-sm text-muted-foreground">
            点击下方「复制系统模板」，即可创建你自己的可编辑副本。
          </p>
          {systemTemplates.map(renderTemplateCard)}
        </section>
      )}

      {!error && myTemplates.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">我的模板</h2>
          {myTemplates.map(renderTemplateCard)}
        </section>
      )}

      {!error && templates.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-center space-y-3">
            <p className="text-muted-foreground">暂无可用模板</p>
            <Button variant="outline" size="sm" onClick={() => void reload()}>
              重新加载
            </Button>
          </CardContent>
        </Card>
      )}

      {dialogUi}
    </div>
  );
}
