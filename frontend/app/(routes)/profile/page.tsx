'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useRouter } from "next/navigation";
import { Download, Loader2, Plus, Smartphone, Building2, Pencil, Trash2, Star } from 'lucide-react';
import {
  fetchAndroidApkInfo,
  downloadAndroidApk,
  formatApkSize,
  type AndroidApkInfo,
} from '@/lib/android-download';
import {
  fetchUserOrgs,
  createUserOrg,
  updateUserOrg,
  deleteUserOrg,
  type UserOrg,
  type CreateOrgInput,
} from '@/lib/user-orgs';

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
  const router = useRouter();

  // --- 组织管理 State ---
  const [orgs, setOrgs] = useState<UserOrg[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(true);

  // 创建/编辑弹窗
  const [orgDialogOpen, setOrgDialogOpen] = useState(false);
  const [orgDialogMode, setOrgDialogMode] = useState<'create' | 'edit'>('create');
  const [editOrgId, setEditOrgId] = useState<string | null>(null);
  const [orgForm, setOrgForm] = useState<CreateOrgInput>({
    name: '',
    industry: '',
    description: '',
    jobTitle: '',
    responsibilities: '',
    setAsDefault: false,
  });
  const [orgSaving, setOrgSaving] = useState(false);

  // 删除确认
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

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

  // 加载组织列表
  const loadOrgs = useCallback(async () => {
    try {
      const data = await fetchUserOrgs();
      setOrgs(data);
    } catch (err) {
      console.error('加载组织失败', err);
    } finally {
      setOrgsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && profile) {
      void loadOrgs();
    }
  }, [loading, profile, loadOrgs]);

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
      localStorage.setItem("user", data.user.name);
      setSuccess('资料更新成功');
    } catch (err) {
      setError('更新失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  // --- 组织操作 ---
  const openCreateOrgDialog = () => {
    setOrgDialogMode('create');
    setEditOrgId(null);
    setOrgForm({ name: '', industry: '', description: '', jobTitle: '', responsibilities: '', setAsDefault: false });
    setOrgDialogOpen(true);
  };

  const openEditOrgDialog = (org: UserOrg) => {
    setOrgDialogMode('edit');
    setEditOrgId(org.organizationId);
    setOrgForm({
      name: org.name,
      industry: org.industry || '',
      description: org.description || '',
      jobTitle: org.jobTitle || '',
      responsibilities: org.responsibilities || '',
      setAsDefault: org.isDefault,
    });
    setOrgDialogOpen(true);
  };

  const handleOrgSave = async () => {
    if (orgDialogMode === 'create' && !orgForm.name.trim()) {
      alert('请输入单位名称');
      return;
    }

    setOrgSaving(true);
    try {
      if (orgDialogMode === 'create') {
        await createUserOrg(orgForm);
      } else if (editOrgId) {
        await updateUserOrg(editOrgId, {
          jobTitle: orgForm.jobTitle,
          responsibilities: orgForm.responsibilities,
          setAsDefault: orgForm.setAsDefault,
        });
      }
      setOrgDialogOpen(false);
      await loadOrgs();
    } catch (err) {
      alert(err instanceof Error ? err.message : '操作失败');
    } finally {
      setOrgSaving(false);
    }
  };

  const handleDelete = async (orgId: string) => {
    setDeleteSaving(true);
    try {
      await deleteUserOrg(orgId);
      setDeleteConfirm(null);
      await loadOrgs();
    } catch (err) {
      alert(err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeleteSaving(false);
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

  const handleDownloadApk = () => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.replace('/login');
      return;
    }
    downloadAndroidApk(token);
  };

  return (
    <div className="p-6 max-w-2xl space-y-6">
      {/* 账户信息 */}
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

      {/* 我的组织 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              我的组织
            </CardTitle>
            <CardDescription>
              添加您所在的单位，AI 将在生成会议纪要时标记与您相关的内容
            </CardDescription>
          </div>
          <Button size="sm" onClick={openCreateOrgDialog}>
            <Plus className="h-4 w-4 mr-1" />
            添加组织
          </Button>
        </CardHeader>

        <CardContent>
          {orgsLoading ? (
            <p className="text-sm text-muted-foreground">加载中...</p>
          ) : orgs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              尚未添加组织。添加后 AI 可在纪要中标记与您职责相关的内容。
            </p>
          ) : (
            <div className="space-y-3">
              {orgs.map((org) => (
                <div
                  key={org.organizationId}
                  className="flex items-start gap-3 rounded-lg border p-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{org.name}</span>
                      {org.isDefault && (
                        <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                      )}
                    </div>
                    {org.industry && (
                      <p className="text-xs text-muted-foreground">{org.industry}</p>
                    )}
                    {org.jobTitle && (
                      <p className="text-sm mt-1">职务：{org.jobTitle}</p>
                    )}
                    {org.responsibilities && (
                      <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                        {org.responsibilities}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEditOrgDialog(org)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => setDeleteConfirm(org.organizationId)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Android 客户端 */}
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
              <Button variant="outline" onClick={handleDownloadApk}>
                <Download className="mr-2 h-4 w-4" />
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

      {/* 创建/编辑组织弹窗 */}
      <Dialog open={orgDialogOpen} onOpenChange={setOrgDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {orgDialogMode === 'create' ? '添加组织' : '编辑组织信息'}
            </DialogTitle>
            <DialogDescription>
              {orgDialogMode === 'create'
                ? '添加您所在的单位，AI 将据此识别纪要中与您相关的内容'
                : '更新您在组织中的职务与职责'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {orgDialogMode === 'create' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="orgName">单位名称 *</Label>
                  <Input
                    id="orgName"
                    value={orgForm.name}
                    onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })}
                    placeholder="例如：XX 大学"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="orgIndustry">所属行业</Label>
                  <Input
                    id="orgIndustry"
                    value={orgForm.industry || ''}
                    onChange={(e) => setOrgForm({ ...orgForm, industry: e.target.value })}
                    placeholder="例如：教育/科研"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="orgDesc">单位简介（可选）</Label>
                  <Textarea
                    id="orgDesc"
                    value={orgForm.description || ''}
                    onChange={(e) => setOrgForm({ ...orgForm, description: e.target.value })}
                    rows={2}
                    placeholder="单位业务简介..."
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="orgJobTitle">您的职务</Label>
              <Input
                id="orgJobTitle"
                value={orgForm.jobTitle || ''}
                onChange={(e) => setOrgForm({ ...orgForm, jobTitle: e.target.value })}
                placeholder="例如：教务处副主任"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="orgResponsibilities">工作职责和内容</Label>
              <Textarea
                id="orgResponsibilities"
                value={orgForm.responsibilities || ''}
                onChange={(e) => setOrgForm({ ...orgForm, responsibilities: e.target.value })}
                rows={4}
                placeholder="描述您在该组织中的职责范围&#10;例如：教务管理、课程安排、教师考核"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="orgIsDefault"
                checked={orgForm.setAsDefault || false}
                onChange={(e) => setOrgForm({ ...orgForm, setAsDefault: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="orgIsDefault" className="text-sm cursor-pointer">
                设为默认组织（录音时自动选用）
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOrgDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void handleOrgSave()} disabled={orgSaving}>
              {orgSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  保存中...
                </>
              ) : (
                '保存'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认弹窗 */}
      <Dialog open={deleteConfirm !== null} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>解绑组织</DialogTitle>
            <DialogDescription>
              确定要解绑该组织吗？已生成的摘要不受影响，但后续录音将不再使用该组织上下文。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && void handleDelete(deleteConfirm)}
              disabled={deleteSaving}
            >
              {deleteSaving ? '删除中...' : '确认解绑'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
