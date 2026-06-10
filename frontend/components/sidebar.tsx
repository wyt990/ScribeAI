'use client';

import { useRouter } from 'next/navigation';
import { Mic, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DashboardNavLinks } from '@/components/dashboard-nav-links';
import { ManagerSidebarLink } from '@/components/manager-sidebar-link';

export function Sidebar() {
  const router = useRouter();

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('userRole');
    router.push('/login');
  };

  return (
    <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border">
      <div className="p-6">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center">
            <Mic className="w-5 h-5 text-sidebar-primary-foreground" />
          </div>
          <span className="text-lg font-bold text-sidebar-foreground">ScribeAI</span>
        </div>
      </div>

      <div className="flex-1 px-3">
        <DashboardNavLinks />
      </div>

      <div className="p-3 space-y-1 border-t border-sidebar-border">
        <ManagerSidebarLink />
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className="w-full justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent"
        >
          <LogOut className="w-5 h-5" />
          退出登录
        </Button>
      </div>
    </div>
  );
}
