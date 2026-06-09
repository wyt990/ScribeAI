'use client';

import { useCallback, useEffect, useState, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Copy,
  Download,
  FileText,
  Link2,
  Loader2,
  Printer,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { SummaryMarkdown } from '@/components/summary-markdown';
import { copyTextToClipboard } from '@/lib/copy-to-clipboard';
import { useIsLoggedIn } from '@/hooks/use-is-logged-in';
import {
  DEFAULT_SUMMARY_TYPE,
  isSummaryType,
  type SummaryType,
} from '@/lib/summary-types';
import { downloadSummaryExport } from '@/lib/summary-export';

type PreviewData = {
  id: string;
  title: string;
  createdAt: string;
  summary: string;
  summaryType: string;
  summaryTypeLabel: string;
};

function SummaryPreviewContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = params.id as string;
  const shareToken = searchParams.get('shareToken');
  const summaryTypeParam = searchParams.get('summaryType');
  const summaryType: SummaryType =
    summaryTypeParam && isSummaryType(summaryTypeParam)
      ? summaryTypeParam
      : DEFAULT_SUMMARY_TYPE;

  const [data, setData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<'docx' | 'pdf' | null>(null);
  const [copying, setCopying] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareUrlLoading, setShareUrlLoading] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const loggedIn = useIsLoggedIn();

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ summaryType });
      if (shareToken) qs.set('shareToken', shareToken);

      const headers: Record<string, string> = {};
      const token = localStorage.getItem('token');
      if (!shareToken && token) {
        headers.Authorization = `Bearer ${token}`;
      } else if (!shareToken && !token) {
        router.replace('/login');
        return;
      }

      const res = await fetch(`/api/sessions/${sessionId}/summary/preview?${qs}`, {
        headers,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '加载纪要失败');
      }
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [sessionId, shareToken, summaryType, router]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  useEffect(() => {
    if (searchParams.get('print') === '1' && data) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [searchParams, data]);

  const fetchShareUrl = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token || shareToken) return null;

    const res = await fetch(`/api/sessions/${sessionId}/summary/share-link`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ summaryType }),
    });
    if (!res.ok) throw new Error('生成分享纪要链接失败');
    const json = await res.json();
    return `${window.location.origin}${json.previewPath}` as string;
  }, [sessionId, shareToken, summaryType]);

  // 进入页面后预取分享链接，避免点击时先 await fetch 导致移动端失去剪贴板写入权限
  useEffect(() => {
    if (shareToken || !data) return;
    let cancelled = false;
    setShareUrlLoading(true);
    void fetchShareUrl()
      .then((url) => {
        if (!cancelled && url) setShareUrl(url);
      })
      .catch(() => {
        // 点击复制时再重试
      })
      .finally(() => {
        if (!cancelled) setShareUrlLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [shareToken, data, fetchShareUrl]);

  const handleExport = async (format: 'docx' | 'pdf') => {
    setExporting(format);
    try {
      const token = localStorage.getItem('token');
      await downloadSummaryExport(sessionId, format, summaryType, {
        shareToken,
        token,
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : '导出失败');
    } finally {
      setExporting(null);
    }
  };

  const handleCopyShareLink = async () => {
    setCopying(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        router.replace('/login');
        return;
      }

      let fullUrl = shareUrl;
      if (!fullUrl) {
        fullUrl = await fetchShareUrl();
        if (fullUrl) setShareUrl(fullUrl);
      }
      if (!fullUrl) throw new Error('生成分享链接失败');

      const copied = await copyTextToClipboard(fullUrl);
      if (copied) {
        alert('预览链接已复制，可在电脑浏览器打开后下载 Word/PDF');
        return;
      }

      // 移动端常见：异步后无法写入剪贴板，改为弹窗供长按复制
      setShareDialogOpen(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : '复制失败');
    } finally {
      setCopying(false);
    }
  };

  const handleSelectShareUrl = (event: React.FocusEvent<HTMLInputElement>) => {
    event.target.select();
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        加载纪要...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 space-y-4">
        <p className="text-destructive">{error || '纪要不存在'}</p>
        {loggedIn && (
          <Button variant="outline" asChild>
            <Link href="/sessions">返回会议记录</Link>
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="summary-preview-page min-h-full bg-muted/30 print:bg-white">
      {/* 工具栏 — 打印时隐藏 */}
      <div className="no-print sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-2 px-4 py-3">
          {loggedIn && (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/sessions">
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  返回
                </Link>
              </Button>
              <span className="text-sm text-muted-foreground hidden sm:inline">|</span>
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={exporting === 'docx'}
            onClick={() => void handleExport('docx')}
          >
            {exporting === 'docx' ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-1 h-4 w-4" />
            )}
            Word
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={exporting === 'pdf'}
            onClick={() => void handleExport('pdf')}
          >
            {exporting === 'pdf' ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <FileText className="mr-1 h-4 w-4" />
            )}
            PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1 h-4 w-4" />
            打印
          </Button>
          {!shareToken && (
            <Button
              variant="outline"
              size="sm"
              disabled={copying || shareUrlLoading}
              onClick={() => void handleCopyShareLink()}
            >
              {copying || shareUrlLoading ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Link2 className="mr-1 h-4 w-4" />
              )}
              复制链接
            </Button>
          )}
        </div>
      </div>

      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>分享纪要链接</DialogTitle>
            <DialogDescription>
              当前浏览器无法自动复制，请长按下方链接手动复制。
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              readOnly
              value={shareUrl ?? ''}
              onFocus={handleSelectShareUrl}
              className="text-sm"
            />
            <Button
              variant="outline"
              size="icon"
              className="shrink-0"
              onClick={() => {
                if (shareUrl) void copyTextToClipboard(shareUrl);
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 文档主体 */}
      <div className="mx-auto max-w-4xl px-4 py-8 print:max-w-none print:px-0 print:py-0">
        <div className="rounded-lg border bg-card px-6 py-8 shadow-sm print:border-0 print:shadow-none print:rounded-none">
          <SummaryMarkdown content={data.summary} />
        </div>
      </div>
    </div>
  );
}

export default function SummaryPreviewPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          加载中...
        </div>
      }
    >
      <SummaryPreviewContent />
    </Suspense>
  );
}
