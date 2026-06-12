'use client';

import { useCallback, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type ConfirmState = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive: boolean;
  resolve: (value: boolean) => void;
};

type AlertState = {
  title: string;
  message: string;
  resolve: () => void;
};

export function useAppDialog() {
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [alertState, setAlertState] = useState<AlertState | null>(null);

  const confirm = useCallback(
    (
      message: string,
      opts?: {
        title?: string;
        confirmLabel?: string;
        cancelLabel?: string;
        destructive?: boolean;
      }
    ) =>
      new Promise<boolean>((resolve) => {
        setConfirmState({
          title: opts?.title ?? '请确认',
          message,
          confirmLabel: opts?.confirmLabel ?? '确认',
          cancelLabel: opts?.cancelLabel ?? '取消',
          destructive: opts?.destructive ?? false,
          resolve,
        });
      }),
    []
  );

  const alert = useCallback(
    (message: string, title = '提示') =>
      new Promise<void>((resolve) => {
        setAlertState({ title, message, resolve });
      }),
    []
  );

  const dialogUi = (
    <>
      <AlertDialog
        open={confirmState != null}
        onOpenChange={(open) => {
          if (!open && confirmState) {
            confirmState.resolve(false);
            setConfirmState(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmState?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmState?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                confirmState?.resolve(false);
                setConfirmState(null);
              }}
            >
              {confirmState?.cancelLabel}
            </AlertDialogCancel>
            <AlertDialogAction
              className={confirmState?.destructive ? 'bg-destructive hover:bg-destructive/90' : undefined}
              onClick={() => {
                confirmState?.resolve(true);
                setConfirmState(null);
              }}
            >
              {confirmState?.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={alertState != null}
        onOpenChange={(open) => {
          if (!open && alertState) {
            alertState.resolve();
            setAlertState(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{alertState?.title}</AlertDialogTitle>
            <AlertDialogDescription>{alertState?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                alertState?.resolve();
                setAlertState(null);
              }}
            >
              知道了
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  return { confirm, alert, dialogUi };
}
