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

export async function downloadAndroidApk(token: string) {
  const res = await fetch('/api/downloads/android', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || '下载失败');
  }

  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match?.[1] || 'ScribeAI-android.apk';

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function formatApkSize(bytes?: number) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
