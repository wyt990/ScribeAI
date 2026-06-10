'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useIsManager } from '@/hooks/use-is-manager';
import { ManagerNav } from '@/components/manager-nav';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isManager, loading } = useIsManager();

  useEffect(() => {
    if (!loading && !isManager) {
      router.replace('/dashboard');
    }
  }, [loading, isManager, router]);

  if (loading) {
    return <div className="p-6 text-muted-foreground">验证权限…</div>;
  }

  if (!isManager) return null;

  return (
    <div className="flex flex-col md:flex-row min-h-[calc(100vh-4rem)]">
      <aside className="shrink-0 border-b md:border-b-0 md:border-r bg-muted/30 p-4 md:w-56 md:min-h-full">
        <div className="mb-4">
          <Button variant="ghost" size="sm" asChild className="px-0">
            <Link href="/dashboard">
              <ArrowLeft className="mr-1 h-4 w-4" />
              返回应用
            </Link>
          </Button>
          <h2 className="text-lg font-semibold mt-2">系统设置</h2>
        </div>
        <ManagerNav />
      </aside>
      <main className="flex-1 p-4 md:p-6 overflow-auto">{children}</main>
    </div>
  );
}
