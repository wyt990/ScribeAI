'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { navigateReplace } from '@/lib/navigation';

/** 根路径：有 token 则进仪表板，否则去登录（WebView 重启后保持登录态） */
export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('token');
    navigateReplace(router, token ? '/dashboard' : '/login');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center text-muted-foreground">
      加载中...
    </div>
  );
}
