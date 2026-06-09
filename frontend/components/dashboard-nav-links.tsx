'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { DASHBOARD_NAV_ITEMS } from '@/lib/dashboard-nav';
import { isAndroidWebView, withCacheBust } from '@/lib/navigation';

type DashboardNavLinksProps = {
  onNavigate?: () => void;
};

export function DashboardNavLinks({ onNavigate }: DashboardNavLinksProps) {
  const pathname = usePathname();

  return (
    <nav className="space-y-1">
      {DASHBOARD_NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive =
          pathname === item.href ||
          (item.href !== '/dashboard' && pathname?.startsWith(item.href));

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={(e) => {
              if (isAndroidWebView()) {
                e.preventDefault();
                window.location.assign(withCacheBust(item.href));
              }
              onNavigate?.();
            }}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              isActive
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
            )}
          >
            <Icon className="w-5 h-5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
