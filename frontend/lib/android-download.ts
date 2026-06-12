export type AndroidApkInfo = {
  available: boolean;
  fileName?: string;
  size?: number;
  updatedAt?: string;
};

export async function fetchAndroidApkInfo(
  token: string
): Promise<AndroidApkInfo> {
  const res = await fetch('/api/downloads/android/info', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return { available: false };
  return res.json();
}

/** 直链 URL，由浏览器原生下载，避免大 APK 整文件进内存 */
export function getAndroidApkDownloadUrl(token: string): string {
  const params = new URLSearchParams({ token });
  return `/api/downloads/android?${params.toString()}`;
}

export function downloadAndroidApk(token: string): void {
  const a = document.createElement('a');
  a.href = getAndroidApkDownloadUrl(token);
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function formatApkSize(bytes?: number) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
