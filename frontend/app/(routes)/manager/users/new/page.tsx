'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { managerApi } from '@/lib/manager-api';
import { useAppDialog } from '@/hooks/use-app-dialog';
import { localizeError } from '@/lib/localize-error';

export default function ManagerNewUserPage() {
  const router = useRouter();
  const { alert, dialogUi } = useAppDialog();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { user } = await managerApi.users.create({ name, email, password, role }) as { user: { id: string } };
      router.push(`/manager/users/${user.id}`);
    } catch (err) {
      await alert(localizeError(err instanceof Error ? err.message : '创建失败'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 max-w-md">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/manager/users">← 返回列表</Link>
      </Button>
      <h1 className="text-2xl font-semibold">新建用户</h1>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <div className="space-y-1">
          <Label>姓名</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label>邮箱</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label>密码</Label>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        </div>
        <div className="space-y-1">
          <Label>角色</Label>
          <select
            className="w-full border rounded-md h-9 px-3 text-sm bg-background"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="user">普通用户</option>
            <option value="manager">管理员 (manager)</option>
          </select>
        </div>
        <Button type="submit" disabled={saving}>{saving ? '创建中…' : '创建'}</Button>
      </form>

      {dialogUi}
    </div>
  );
}
