/** 清除网页端登录态 */
export function clearAuthSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
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
