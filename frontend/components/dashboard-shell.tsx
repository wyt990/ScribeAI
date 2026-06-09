'use client';

import { Sidebar } from '@/components/sidebar';
import { Navbar } from '@/components/navbar';
import { useIsLoggedIn } from '@/hooks/use-is-logged-in';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const loggedIn = useIsLoggedIn();

  if (!loggedIn) {
    return <main className="min-h-screen overflow-auto">{children}</main>;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="hidden md:block w-64 flex-shrink-0">
        <Sidebar />
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <Navbar />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
