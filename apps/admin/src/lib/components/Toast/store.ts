import { writable } from 'svelte/store';

export type ToastType = 'info' | 'success' | 'error';
export interface ToastInfo {
  id?: number;
  type: ToastType;
  dismissible: boolean;
  timeout?: number;
  message: string;
}

export const toasts = writable<ToastInfo[]>([]);

export const removeToast = (id: number) => {
  toasts.update(queue => queue.filter(t => t.id !== id));
};

export const addToast = (toast: ToastInfo) => {
  const id = Math.floor(Math.random() * 1000);

  const t = { ...toast };
  t.id = id;
  toasts.update(queue => [t, ...queue]);

  if (toast.timeout) {
    setTimeout(() => removeToast(id), toast.timeout);
  }
};
