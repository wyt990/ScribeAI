/**
 * 防止录音时熄屏：优先 Screen Wake Lock API，iOS / 失败时用静音循环视频兜底。
 * iOS 上 Wake Lock 为「请求」而非保证，低电量、注视感知、自动锁定仍可能熄屏。
 */

const KEEP_AWAKE_VIDEO = '/media/keep-awake.mp4';

let wakeLockSentinel: WakeLockSentinel | null = null;
let noSleepVideo: HTMLVideoElement | null = null;
let activeCount = 0;

export function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function supportsWakeLockApi(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
}

async function releaseWakeLockApi(): Promise<void> {
  if (!wakeLockSentinel) return;
  try {
    await wakeLockSentinel.release();
  } catch {
    /* ignore */
  }
  wakeLockSentinel = null;
}

function stopNoSleepVideo(): void {
  if (!noSleepVideo) return;
  try {
    noSleepVideo.pause();
    noSleepVideo.removeAttribute('src');
    noSleepVideo.load();
    noSleepVideo.remove();
  } catch {
    /* ignore */
  }
  noSleepVideo = null;
}

async function startNoSleepVideo(): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  if (noSleepVideo) return true;

  const video = document.createElement('video');
  video.setAttribute('playsinline', 'true');
  video.setAttribute('webkit-playsinline', 'true');
  video.setAttribute('x-webkit-airplay', 'deny');
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.style.cssText =
    'position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;left:-9999px;top:-9999px;';
  video.src = KEEP_AWAKE_VIDEO;

  document.body.appendChild(video);

  try {
    await video.play();
    noSleepVideo = video;
    return true;
  } catch (err) {
    video.remove();
    console.warn('[ScreenWake] NoSleep video failed:', (err as Error)?.message);
    return false;
  }
}

async function requestWakeLockApi(): Promise<boolean> {
  if (!supportsWakeLockApi()) return false;
  if (document.visibilityState === 'hidden') return false;

  try {
    await releaseWakeLockApi();
    wakeLockSentinel = await navigator.wakeLock.request('screen');
    wakeLockSentinel.addEventListener('release', () => {
      wakeLockSentinel = null;
    });
    return true;
  } catch (err) {
    console.warn('[ScreenWake] Wake Lock failed:', (err as Error)?.message);
    return false;
  }
}

/** 开始防熄屏（可多次调用，需配对 release） */
export async function acquireScreenWake(): Promise<void> {
  activeCount += 1;
  if (activeCount > 1) return;

  const apiOk = await requestWakeLockApi();
  const needFallback = isIOSDevice() || !apiOk;
  if (needFallback) {
    await startNoSleepVideo();
  }
}

/** 结束防熄屏 */
export async function releaseScreenWake(): Promise<void> {
  if (activeCount <= 0) return;
  activeCount -= 1;
  if (activeCount > 0) return;

  await releaseWakeLockApi();
  stopNoSleepVideo();
}

/** 页面从后台回到前台时，录音中应重新申请 */
export async function reacquireScreenWakeIfNeeded(recording: boolean): Promise<void> {
  if (!recording || activeCount <= 0) return;
  await requestWakeLockApi();
  if (isIOSDevice() && !noSleepVideo) {
    await startNoSleepVideo();
  }
}

export type ScreenWakeStatus = {
  wakeLockApi: boolean;
  noSleepFallback: boolean;
  isIOS: boolean;
};

export function getScreenWakeStatus(): ScreenWakeStatus {
  return {
    wakeLockApi: supportsWakeLockApi() && wakeLockSentinel != null,
    noSleepFallback: noSleepVideo != null,
    isIOS: isIOSDevice(),
  };
}
