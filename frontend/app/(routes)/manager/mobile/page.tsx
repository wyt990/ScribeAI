'use client';

import { useEffect, useState } from 'react';
import { fetchAndroidApkInfo, formatApkSize, type AndroidApkInfo } from '@/lib/android-download';
import { ManagerMobileForm } from '@/components/manager-mobile-form';

export default function ManagerMobilePage() {
  const [apk, setApk] = useState<AndroidApkInfo | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    void fetchAndroidApkInfo(token).then(setApk).catch(() => setApk(null));
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">移动端设置</h1>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">APK 下载</h2>
        {apk?.available ? (
          <p className="text-sm text-muted-foreground">
            当前 APK：{apk.fileName} · {formatApkSize(apk.size)}
            {apk.updatedAt ? ` · 更新于 ${new Date(apk.updatedAt).toLocaleString()}` : ''}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">暂未检测到 APK 文件，请配置路径并放置安装包。</p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">客户端功能</h2>
        <ManagerMobileForm />
      </section>

      <p className="text-xs text-muted-foreground">
        增益下限/上限/步进/默认值保存后，用户下次打开录音页（重新进入 Dashboard）即按新参数加载；已保存的用户增益会自动收敛到新上下限内。
        原生静音分句 RMS 阈值及 STT 页的 VAD 宽限/最短语音/前置填充参数，均在下次开始录音时生效。
      </p>
    </div>
  );
}
