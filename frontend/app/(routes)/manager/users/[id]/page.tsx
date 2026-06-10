'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { managerApi, type ManagerUser } from '@/lib/manager-api';

export default function ManagerUserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [user, setUser] = useState<ManagerUser | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('user');
  const [isActive, setIsActive] = useState(true);
  const [newPassword, setNewPassword] = useState('');
  const [confirmDelete, setConfirmDelete] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void managerApi.users.get(id).then((d) => {
      setUser(d.user);
      setName(d.user.name);
      setEmail(d.user.email);
      setRole(d.user.role);
      setIsActive(d.user.isActive);
    });
  }, [id]);

  const save = async () => {
    setSaving(true);
    try {
      await managerApi.users.update(id, { name, email, role, isActive });
      alert('已保存');
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const resetPassword = async () => {
    if (newPassword.length < 6) return alert('密码至少 6 位');
    try {
      await managerApi.users.resetPassword(id, newPassword);
      setNewPassword('');
      alert('密码已重置');
    } catch (err) {
      alert(err instanceof Error ? err.message : '重置失败');
    }
  };

  const remove = async () => {
    if (confirmDelete !== user?.email) return alert('请输入用户邮箱以确认删除');
    try {
      await managerApi.users.delete(id);
      router.push('/manager/users');
    } catch (err) {
      alert(err instanceof Error ? err.message : '删除失败');
    }
  };

  if (!user) return <p className="text-muted-foreground">加载中…</p>;

  return (
    <div className="space-y-6 max-w-lg">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/manager/users">← 返回列表</Link>
      </Button>
      <h1 className="text-2xl font-semibold">用户：{user.name}</h1>
      <p className="text-sm text-muted-foreground">
        会议 {user._count?.transcripts ?? 0} · 草稿 {user._count?.drafts ?? 0}
      </p>

      <section className="space-y-3 border rounded-lg p-4">
        <h2 className="font-medium">基本信息</h2>
        <div className="space-y-1">
          <Label>姓名</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>邮箱</Label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>角色</Label>
          <select
            className="w-full border rounded-md h-9 px-3 text-sm bg-background"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="user">普通用户</option>
            <option value="manager">管理员</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          账号启用
        </label>
        <Button onClick={() => void save()} disabled={saving}>保存</Button>
      </section>

      <section className="space-y-3 border rounded-lg p-4">
        <h2 className="font-medium">重置密码</h2>
        <Input
          type="password"
          placeholder="新密码（至少 6 位）"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <Button variant="outline" onClick={() => void resetPassword()}>重置密码</Button>
      </section>

      <section className="space-y-3 border border-destructive/30 rounded-lg p-4">
        <h2 className="font-medium text-destructive">删除用户</h2>
        <p className="text-sm text-muted-foreground">输入邮箱 <strong>{user.email}</strong> 以确认</p>
        <Input value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} />
        <Button variant="destructive" onClick={() => void remove()}>永久删除</Button>
      </section>
    </div>
  );
}
