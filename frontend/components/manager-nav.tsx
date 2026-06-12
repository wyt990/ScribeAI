'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

type ManagerNavItem = {
  href: string;
  label: string;
  exact?: boolean;
};

export const MANAGER_NAV: ManagerNavItem[] = [
  { href: '/manager', label: '概览', exact: true },
  { href: '/manager/users', label: '用户管理' },
  { href: '/manager/settings/stt', label: '语音识别' },
  { href: '/manager/settings/llm', label: '纪要 LLM' },
  { href: '/manager/settings/storage', label: '存储清理' },
  { href: '/manager/settings/security', label: '安全与超时' },
  { href: '/manager/settings/observability', label: '可观测性' },
  { href: '/manager/templates', label: '模板与 Skills' },
  { href: '/manager/content', label: '内容管理' },
  { href: '/manager/mobile', label: '移动端 APK' },
  { href: '/manager/audit', label: '审计日志' },
];

export function getManagerNavLabel(pathname: string | null): string {
  if (!pathname) return '系统设置';
  const exact = MANAGER_NAV.find((item) => item.exact && pathname === item.href);
  if (exact) return exact.label;
  const prefix = [...MANAGER_NAV]
    .filter((item) => !item.exact)
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => pathname.startsWith(item.href));
  return prefix?.label ?? '系统设置';
}

type ManagerNavProps = {
  onNavigate?: () => void;
  className?: string;
};

export function ManagerNav({ onNavigate, className }: ManagerNavProps) {
  const pathname = usePathname();

  return (
    <nav className={cn('space-y-0.5', className)}>
      {MANAGER_NAV.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname?.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              'block rounded-lg px-3 py-2 text-sm transition-colors',
              active
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
