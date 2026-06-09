type AppRouter = {
  push: (href: string) => void;
  replace: (href: string) => void;
};

/** Android WebView 壳应用（MainActivity 自定义 UA） */
export function isAndroidWebView(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    navigator.userAgent.includes('ScribeAI-Android')
  );
}

/** 为路径追加 rand 参数，绕过 WebView / CDN 对 HTML 的强缓存 */
export function withCacheBust(path: string): string {
  const [pathname, search = ''] = path.split('?');
  const params = new URLSearchParams(search);
  params.set('rand', String(Date.now()));
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : `${pathname}?rand=${Date.now()}`;
}

function hardNavigate(path: string, replace = false): void {
  const url = withCacheBust(path);
  if (replace) {
    window.location.replace(url);
  } else {
    window.location.assign(url);
  }
}

/** WebView 内整页跳转并带 rand；浏览器内走 Next 客户端路由 */
export function navigatePush(router: AppRouter, path: string): void {
  if (isAndroidWebView()) {
    hardNavigate(path);
    return;
  }
  router.push(withCacheBust(path));
}

export function navigateReplace(router: AppRouter, path: string): void {
  if (isAndroidWebView()) {
    hardNavigate(path, true);
    return;
  }
  router.replace(withCacheBust(path));
}
