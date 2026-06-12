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
import { downloadSummaryExport } from '@/lib/summary-export';
import { useAppDialog } from '@/hooks/use-app-dialog';
import { localizeError } from '@/lib/localize-error';

type PreviewData = {
  id: string;
  title: string;
  createdAt: string;
  summary: string;
  templateId: string;
  templateName: string;
  summaryType?: string;
  summaryTypeLabel: string;
};

function formatShareExpiresIn(expiresIn: string): string {
  const m = expiresIn.match(/^(\d+)([dhms])$/);
  if (!m) return expiresIn;
  const n = Number(m[1]);
  const unit = m[2];
  const labels: Record<string, string> = { d: '天', h: '小时', m: '分钟', s: '秒' };
  return `${n} ${labels[unit] ?? unit}`;
}

function SummaryPreviewContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = params.id as string;
  const shareToken = searchParams.get('shareToken');
  const templateIdParam = searchParams.get('templateId');
  const summaryTypeParam = searchParams.get('summaryType');
  const { alert, dialogUi } = useAppDialog();

  const [data, setData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [exporting, setExporting] = useState<'docx' | 'pdf' | null>(null);
  const [copying, setCopying] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareExpiresIn, setShareExpiresIn] = useState<string | null>(null);
  const [shareUrlLoading, setShareUrlLoading] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const loggedIn = useIsLoggedIn();

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    setErrorCode(null);
    try {
      const qs = new URLSearchParams();
      if (templateIdParam) qs.set('templateId', templateIdParam);
      if (summaryTypeParam) qs.set('summaryType', summaryTypeParam);
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
        const err = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
        setErrorCode(err.code ?? null);
        throw new Error(localizeError(err.error || '加载纪要失败', err.code));
      }
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [sessionId, shareToken, templateIdParam, summaryTypeParam, router]);

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
      body: JSON.stringify({
        templateId: data?.templateId ?? templateIdParam,
        summaryType: summaryTypeParam,
      }),
    });
    if (!res.ok) throw new Error('生成分享纪要链接失败');
    const json = (await res.json()) as { previewPath: string; expiresIn?: string };
    if (json.expiresIn) setShareExpiresIn(json.expiresIn);
    return `${window.location.origin}${json.previewPath}` as string;
  }, [sessionId, shareToken, templateIdParam, summaryTypeParam, data?.templateId]);

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
      const tid = data?.templateId ?? templateIdParam;
      if (!tid) throw new Error('缺少模板 ID');
      await downloadSummaryExport(sessionId, format, tid, {
        shareToken,
        token,
      });
    } catch (err) {
      await alert(localizeError(err instanceof Error ? err.message : '导出失败'));
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
        const expiryHint = shareExpiresIn
          ? `链接有效期 ${formatShareExpiresIn(shareExpiresIn)}。`
          : '';
        await alert(`预览链接已复制，可在电脑浏览器打开后下载 Word/PDF。${expiryHint}`);
        return;
      }

      setShareDialogOpen(true);
    } catch (err) {
      await alert(localizeError(err instanceof Error ? err.message : '复制失败'));
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
    const isShareExpired =
      errorCode === 'SHARE_TOKEN_EXPIRED' ||
      errorCode === 'SHARE_TOKEN_INVALID';
    return (
      <div className="p-6 space-y-4 max-w-lg">
        <p className="text-destructive">{error || '纪要不存在'}</p>
        {isShareExpired && (
          <p className="text-sm text-muted-foreground">
            分享链接可能已过期或被撤销，请联系分享者重新生成链接。
          </p>
        )}
        {loggedIn && (
          <Button variant="outline" asChild>
            <Link href="/sessions">返回会议记录</Link>
          </Button>
        )}
        {dialogUi}
      </div>
    );
  }

  return (
    <div className="summary-preview-page min-h-full bg-muted/30 print:bg-white">
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
          {!shareToken && shareExpiresIn && (
            <span className="text-xs text-muted-foreground w-full sm:w-auto">
              分享链接有效期 {formatShareExpiresIn(shareExpiresIn)}
            </span>
          )}
        </div>
      </div>

      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>分享纪要链接</DialogTitle>
            <DialogDescription>
              当前浏览器无法自动复制，请长按下方链接手动复制。
              {shareExpiresIn && (
                <> 链接有效期 {formatShareExpiresIn(shareExpiresIn)}。</>
              )}
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

      <div className="mx-auto max-w-4xl px-4 py-8 print:max-w-none print:px-0 print:py-0">
        <div className="rounded-lg border bg-card px-6 py-8 shadow-sm print:border-0 print:shadow-none print:rounded-none">
          <SummaryMarkdown content={data.summary} />
        </div>
      </div>

      {dialogUi}
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
