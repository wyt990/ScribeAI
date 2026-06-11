'use client';

import { useEffect, useRef, useState } from 'react';
import { useRecordingStore } from '@/lib/store';

/** 录音进行中累计时长（暂停期间不计入） */
export function useRecordingDuration(): number {
  const status = useRecordingStore((s) => s.status);
  const [seconds, setSeconds] = useState(0);
  const activeStartRef = useRef<number | null>(null);
  const accumulatedRef = useRef(0);

  useEffect(() => {
    if (status === 'recording') {
      activeStartRef.current = Date.now();

      const tick = () => {
        const start = activeStartRef.current;
        if (!start) return;
        setSeconds(
          accumulatedRef.current + Math.floor((Date.now() - start) / 1000)
        );
      };

      tick();
      const id = setInterval(tick, 1000);
      return () => clearInterval(id);
    }

    if (status === 'paused') {
      if (activeStartRef.current) {
        accumulatedRef.current += Math.floor(
          (Date.now() - activeStartRef.current) / 1000
        );
        activeStartRef.current = null;
      }
      return;
    }

    accumulatedRef.current = 0;
    activeStartRef.current = null;
    setSeconds(0);
  }, [status]);

  return seconds;
}
