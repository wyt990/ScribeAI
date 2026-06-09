'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Navbar } from '@/components/navbar';
import { MobilePromoteBar } from '@/components/mobile-promote-bar';
import { useIsLoggedIn } from '@/hooks/use-is-logged-in';
import { cn } from '@/lib/utils';

/** 会议录音页需要锁高度、内部弹性布局；其余页面允许纵向滚动 */
function usesFixedViewportLayout(pathname: string | null): boolean {
  return pathname === '/dashboard';
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const loggedIn = useIsLoggedIn();
  const pathname = usePathname();
  const fixedLayout = usesFixedViewportLayout(pathname);

  if (!loggedIn) {
    return <main className="min-h-screen overflow-auto">{children}</main>;
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      <aside className="hidden md:block w-64 flex-shrink-0">
        <Sidebar />
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <Navbar />
        <main
          className={cn(
            'flex-1 min-h-0 flex flex-col',
            fixedLayout ? 'overflow-hidden' : 'overflow-y-auto overscroll-y-contain'
          )}
        >
          {children}
        </main>
        <MobilePromoteBar />
      </div>
    </div>
  );
}
