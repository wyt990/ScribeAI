'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { managerApi } from '@/lib/manager-api';

type Tpl = {
  id: string;
  name: string;
  isSystem: boolean;
  reviewStatus: string;
  isPublic: boolean;
  owner?: { name: string; email: string } | null;
};

export default function ManagerTemplatesPage() {
  const [templates, setTemplates] = useState<Tpl[]>([]);
  const [pending, setPending] = useState<Tpl[]>([]);

  const reload = async () => {
    const [all, pend] = await Promise.all([
      managerApi.templates.list(),
      managerApi.templates.pending(),
    ]);
    setTemplates(all.templates as Tpl[]);
    setPending(pend.templates as Tpl[]);
  };

  useEffect(() => {
    void reload().catch(console.error);
  }, []);

  const review = async (id: string, action: 'approve' | 'reject') => {
    await managerApi.templates.review(id, action);
    await reload();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">模板与 Skills</h1>

      {pending.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">待审核公共模板</h2>
          {pending.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-2 border rounded-lg p-3">
              <span className="font-medium">{t.name}</span>
              <Button size="sm" onClick={() => void review(t.id, 'approve')}>通过</Button>
              <Button size="sm" variant="outline" onClick={() => void review(t.id, 'reject')}>拒绝</Button>
            </div>
          ))}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-medium">全部模板</h2>
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3">名称</th>
                <th className="text-left p-3">类型</th>
                <th className="text-left p-3">所有者</th>
                <th className="text-left p-3">状态</th>
                <th className="text-left p-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className="border-t">
                  <td className="p-3">{t.name}</td>
                  <td className="p-3">{t.isSystem ? '系统' : '用户'}</td>
                  <td className="p-3">{t.owner?.name ?? '—'}</td>
                  <td className="p-3">{t.reviewStatus}</td>
                  <td className="p-3">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/manager/templates/${t.id}`}>编辑 Skill</Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
