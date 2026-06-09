'use client';

import { useTheme } from 'next-themes';
import { Menu, Moon, Sun, User, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { DashboardNavLinks } from '@/components/dashboard-nav-links';

export function Navbar() {
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();   // 👈 Add this
  const [mounted, setMounted] = useState(false); // 👈 to fix hydration
  const [name, setUserName] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (user) {

      setUserName(user);
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/login');
  };

  const getInitials = (name: string) => {
    return name.charAt(0).toUpperCase();
  };

  // 👇 Extract page name dynamically
  const pageTitle = (() => {
    if (!pathname) return '';

    if (pathname.startsWith('/dashboard')) return '会议录音';
    if (pathname.startsWith('/drafts')) return '草稿箱';
    if (pathname.startsWith('/sessions')) return '会议记录';
    if (pathname.startsWith('/profile')) return '个人资料';

    return '会议录音';
  })();

  return (
    <header className="h-16 border-b border-border bg-card flex items-center justify-between px-4 md:px-6">
      <div className="flex items-center gap-2 md:gap-4">
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden shrink-0" aria-label="打开导航菜单">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-64 p-0 bg-sidebar text-sidebar-foreground border-sidebar-border shadow-xl"
          >
            <SheetHeader className="p-6 border-b border-sidebar-border text-left">
              <SheetTitle className="text-lg font-bold text-sidebar-foreground">ScribeAI</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col h-[calc(100%-5rem)]">
              <div className="flex-1 px-3 pt-3">
                <DashboardNavLinks onNavigate={() => setMobileNavOpen(false)} />
              </div>
              <div className="p-3 space-y-1 border-t border-sidebar-border">
                {mounted && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                    className="w-full justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent"
                  >
                    {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                    切换主题
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setMobileNavOpen(false);
                    handleLogout();
                  }}
                  className="w-full justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent"
                >
                  <LogOut className="w-5 h-5" />
                  退出登录
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
        <h1 className="text-xl md:text-2xl font-semibold text-foreground">
          {pageTitle}
        </h1>
      </div>

      <div className="flex items-center gap-2">
        {/* 👇 Prevent hydration mismatch for theme toggle */}
        {mounted && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? (
              <Sun className="w-5 h-5" />
            ) : (
              <Moon className="w-5 h-5" />
            )}
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full">
              <Avatar>
                <AvatarFallback>{getInitials(name)}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="text-sm font-medium">我的账户</span>
                <span className="text-xs text-muted-foreground">{name}</span>
              </div>
            </DropdownMenuLabel>

            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={() => router.push('/profile')}>
              <User className="w-4 h-4 mr-2" />
              个人资料
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={handleLogout}>
              退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
