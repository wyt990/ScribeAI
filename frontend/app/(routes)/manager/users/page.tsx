'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { managerApi, type ManagerUser } from '@/lib/manager-api';
import { localizeError } from '@/lib/localize-error';

const PAGE_SIZE = 20;

export default function ManagerUsersPage() {
  const [users, setUsers] = useState<ManagerUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await managerApi.users.list({
        page,
        pageSize: PAGE_SIZE,
        q: searchQuery || undefined,
      });
      setUsers(data.users);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      if (data.page !== page) setPage(data.page);
    } catch (err) {
      console.error(err);
      setUsers([]);
      setError(localizeError(err instanceof Error ? err.message : '加载用户列表失败'));
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">用户管理</h1>
        <Button asChild>
          <Link href="/manager/users/new">新建用户</Link>
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <Input
          placeholder="搜索姓名或邮箱…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="max-w-sm"
        />
        {searchInput.trim() && (
          <Button variant="ghost" size="sm" onClick={() => setSearchInput('')}>
            清除搜索
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

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
            {loading ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    <Spinner className="size-4" />
                    加载中…
                  </span>
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                  {searchQuery ? `未找到与「${searchQuery}」匹配的用户` : '暂无用户'}
                </td>
              </tr>
            ) : (
              users.map((u) => (
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
              ))
            )}
          </tbody>
        </table>
      </div>

      {!error && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <p>
            共 {total} 人
            {searchQuery ? `（搜索：${searchQuery}）` : ''}
            {totalPages > 1 ? ` · 第 ${page} / ${totalPages} 页` : ''}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={loading || page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={loading || page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              下一页
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
