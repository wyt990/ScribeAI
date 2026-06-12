'use client';

import { ManagerSettingsForm } from '@/components/manager-settings-form';
import { useEffect, useState } from 'react';
import { fetchAndroidApkInfo, formatApkSize, type AndroidApkInfo } from '@/lib/android-download';

export default function ManagerMobilePage() {
  const [apk, setApk] = useState<AndroidApkInfo | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    void fetchAndroidApkInfo(token).then(setApk).catch(() => setApk(null));
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">移动端 APK</h1>
      {apk?.available ? (
        <p className="text-sm text-muted-foreground">
          当前 APK：{apk.fileName} · {formatApkSize(apk.size)}
          {apk.updatedAt ? ` · 更新于 ${new Date(apk.updatedAt).toLocaleString()}` : ''}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">暂未检测到 APK 文件，请配置路径并放置安装包。</p>
      )}
      <ManagerSettingsForm group="mobile" />
      <p className="text-xs text-muted-foreground">
        将编译好的 APK 放到配置路径后，用户可在个人资料页下载。上传功能后续可扩展。
        「显示录音页音频增强面板」填 true 或 false；隐藏后用户界面不显示增益/降噪控件，但已保存的音频增强设置仍会在录音时生效。
        「原生分片模式」：auto=说完一句（静音后）再发送，timer=按固定秒数切分。定时节间隔、静音分句 RMS 阈值及 STT 页的 VAD 宽限/最短语音/前置填充参数，均在下次开始录音时生效。
      </p>
    </div>
  );
}
