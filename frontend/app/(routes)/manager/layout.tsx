'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useIsManager } from '@/hooks/use-is-manager';
import { getManagerNavLabel, ManagerNav } from '@/components/manager-nav';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ArrowLeft, Menu } from 'lucide-react';

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isManager, loading } = useIsManager();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (!loading && !isManager) {
      router.replace('/dashboard');
    }
  }, [loading, isManager, router]);

  if (loading) {
    return <div className="p-6 text-muted-foreground">验证权限…</div>;
  }

  if (!isManager) return null;

  const currentLabel = getManagerNavLabel(pathname);

  return (
    <div className="flex flex-col md:flex-row min-h-[calc(100vh-4rem)]">
      {/* 移动端：紧凑顶栏 + 抽屉菜单，避免 11 项纵向菜单占满屏幕 */}
      <div className="md:hidden shrink-0 flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
        <Button variant="ghost" size="sm" asChild className="shrink-0 px-2">
          <Link href="/dashboard" aria-label="返回应用">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground leading-none">系统设置</p>
          <p className="text-sm font-semibold truncate">{currentLabel}</p>
        </div>
        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="shrink-0">
              <Menu className="mr-1 h-4 w-4" />
              菜单
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[min(100vw-2rem,18rem)] p-0">
            <SheetHeader className="border-b px-4 py-4 text-left">
              <SheetTitle>系统设置</SheetTitle>
            </SheetHeader>
            <div className="overflow-y-auto px-3 py-3">
              <ManagerNav onNavigate={() => setNavOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* 桌面端：固定侧栏 */}
      <aside className="hidden md:flex md:flex-col shrink-0 border-r bg-muted/30 p-4 w-56 min-h-full">
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

      <main className="flex-1 min-h-0 p-4 md:p-6 overflow-auto">{children}</main>
    </div>
  );
}
