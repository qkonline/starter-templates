// Short messages that appear in a corner and go by themselves ("Saved", "Copied"), shown by
// <Toaster> in the root layout. From anywhere: toast(t('Saved')), toast(t('Couldn’t save'), { tone: 'error' }).

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

export const toasts = $state<Toast[]>([]);

let next = 1;

/** Shows `message` for `ms` (5 s; errors stay until closed when 0). Returns a way to close it. */
export function toast(message: string, { tone = 'info', ms = 5000 }: { tone?: ToastTone; ms?: number } = {}) {
  const id = next++;
  toasts.push({ id, message, tone });
  const close = () => dismiss(id);
  if (ms > 0) setTimeout(close, ms);
  return close;
}

export function dismiss(id: number): void {
  const i = toasts.findIndex((t) => t.id === id);
  if (i >= 0) toasts.splice(i, 1);
}
