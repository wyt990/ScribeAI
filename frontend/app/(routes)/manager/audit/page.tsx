'use client';

import { useEffect, useState } from 'react';
import { managerApi } from '@/lib/manager-api';

type Log = {
  id: string;
  action: string;
  target: string | null;
  createdAt: string;
  user: { name: string; email: string };
};

export default function ManagerAuditPage() {
  const [logs, setLogs] = useState<Log[]>([]);

  useEffect(() => {
    void managerApi.audit.list().then((d) => setLogs(d.logs as Log[])).catch(console.error);
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">审计日志</h1>
      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3">时间</th>
              <th className="text-left p-3">操作者</th>
              <th className="text-left p-3">动作</th>
              <th className="text-left p-3">目标</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="p-3 whitespace-nowrap">{new Date(l.createdAt).toLocaleString()}</td>
                <td className="p-3">{l.user.name}</td>
                <td className="p-3">{l.action}</td>
                <td className="p-3">{l.target ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
