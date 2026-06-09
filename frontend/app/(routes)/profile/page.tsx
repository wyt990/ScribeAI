'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useRouter } from "next/navigation";
import { Download, Loader2, Smartphone } from 'lucide-react';
import {
  fetchAndroidApkInfo,
  downloadAndroidApk,
  formatApkSize,
  type AndroidApkInfo,
} from '@/lib/android-download';

export default function ProfilePage() {
  const [profile, setProfile] = useState<any>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [apkInfo, setApkInfo] = useState<AndroidApkInfo | null>(null);
  const [apkLoading, setApkLoading] = useState(true);
  const [apkDownloading, setApkDownloading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    async function fetchProfile() {
      const token = localStorage.getItem("token");

      if (!token) {
        router.replace("/login");
        return;
      }

      try {
        const res = await fetch("/api/auth/me", {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        });

        const data = await res.json();

        if (!res.ok) {
          router.replace("/login");
          return;
        }

        setProfile(data.user);
        setName(data.user.name);
        setEmail(data.user.email);
      } catch (err) {
        console.error("Error fetching profile", err);
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, [router]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    void fetchAndroidApkInfo(token)
      .then(setApkInfo)
      .finally(() => setApkLoading(false));
  }, []);

  const handleSave = async () => {
    setError('');
    setSuccess('');

    if (!name.trim()) {
      setError('姓名不能为空');
      return;
    }

    if (!email.trim()) {
      setError('邮箱不能为空');
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: name.trim(), email: email.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "更新失败");
        return;
      }

      setProfile(data.user);
      // 同步更新 localStorage 中的用户名
      localStorage.setItem("user", data.user.name);
      setSuccess('资料更新成功');
    } catch (err) {
      setError('更新失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">加载资料中...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-6">
        <p className="text-red-500">加载资料失败。</p>
      </div>
    );
  }

  const hasChanges = name !== profile.name || email !== profile.email;

  const handleDownloadApk = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.replace('/login');
      return;
    }
    setApkDownloading(true);
    try {
      await downloadAndroidApk(token);
    } catch (err) {
      alert(err instanceof Error ? err.message : '下载失败');
    } finally {
      setApkDownloading(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>账户信息</CardTitle>
          <CardDescription>管理您的账户详情</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {success && (
            <Alert className="bg-success text-success-foreground border-success">
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">姓名</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">邮箱</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="flex gap-3">
            <Button onClick={handleSave} disabled={saving || !hasChanges}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  保存中...
                </>
              ) : (
                '保存修改'
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setName(profile.name);
                setEmail(profile.email);
                setError('');
                setSuccess('');
              }}
              disabled={!hasChanges}
            >
              取消
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Android 客户端
          </CardTitle>
          <CardDescription>
            安装 ScribeAI 手机应用，在移动端使用会议录音与转录
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {apkLoading ? (
            <p className="text-sm text-muted-foreground">检查安装包...</p>
          ) : apkInfo?.available ? (
            <>
              <p className="text-sm text-muted-foreground">
                版本文件：{apkInfo.fileName}
                {apkInfo.size ? ` · ${formatApkSize(apkInfo.size)}` : ''}
                {apkInfo.updatedAt
                  ? ` · 更新于 ${new Date(apkInfo.updatedAt).toLocaleString('zh-CN')}`
                  : ''}
              </p>
              <Button
                variant="outline"
                onClick={() => void handleDownloadApk()}
                disabled={apkDownloading}
              >
                {apkDownloading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                下载 Android 安装包
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              暂无可下载的 Android 安装包，请联系管理员发布。
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
