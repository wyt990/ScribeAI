import { disconnectSocket } from './socket';

/** 清除网页端登录态 */
export function clearAuthSession(): void {
  if (typeof window === 'undefined') return;
  disconnectSocket();
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('userRole');
}

/** 通知后端登出审计后清理本地登录态 */
export async function logoutSession(): Promise<void> {
  if (typeof window === 'undefined') return;
  const token = localStorage.getItem('token');
  if (token) {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // 登出审计失败不阻断本地清理
    }
  }
  clearAuthSession();
}

/** 校验 token 是否仍有效 */
export async function validateAuthToken(token: string): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}
