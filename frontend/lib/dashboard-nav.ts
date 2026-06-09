import { Mic, History, User, FileAudio, type LucideIcon } from 'lucide-react';

export type DashboardNavItem = {
  href: string;
  icon: LucideIcon;
  label: string;
};

export const DASHBOARD_NAV_ITEMS: DashboardNavItem[] = [
  { href: '/dashboard', icon: Mic, label: '会议录音' },
  { href: '/drafts', icon: FileAudio, label: '草稿箱' },
  { href: '/sessions', icon: History, label: '会议记录' },
  { href: '/profile', icon: User, label: '个人资料' },
];
