'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { managerApi, type ManagerUser } from '@/lib/manager-api';

export default function ManagerUsersPage() {
  const [users, setUsers] = useState<ManagerUser[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = () =>
    managerApi.users.list().then((d) => setUsers(d.users)).catch(console.error);

  useEffect(() => {
    void reload().finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-muted-foreground">加载中…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">用户管理</h1>
        <Button asChild>
          <Link href="/manager/users/new">新建用户</Link>
        </Button>
      </div>
      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3">姓名</th>
              <th className="text-left p-3">邮箱</th>
              <th className="text-left p-3">角色</th>
              <th className="text-left p-3">状态</th>
              <th className="text-left p-3">会议数</th>
              <th className="text-left p-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="p-3">{u.name}</td>
                <td className="p-3">{u.email}</td>
                <td className="p-3">{u.role}</td>
                <td className="p-3">{u.isActive ? '正常' : '已禁用'}</td>
                <td className="p-3">{u._count?.transcripts ?? 0}</td>
                <td className="p-3">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/manager/users/${u.id}`}>管理</Link>
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
