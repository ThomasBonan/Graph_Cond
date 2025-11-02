// ============================================================================
// toasts.js
// ----------------------------------------------------------------------------
// Petit store Svelte gerant les notifications empilees. Les helpers exposes
// facilitent l ajout de toasts succes/erreur/info avec gestion automatique
// du timeout et suppression.
// ============================================================================
import { writable } from 'svelte/store';

export const toasts = writable([]);

let toastId = 0;

export function pushToast({ message, type = 'info', timeout = 4000 }) {
  if (!message) return null;
  const id = ++toastId;
  const entry = { id, type, message };
  toasts.update((items) => [...items, entry]);

  if (timeout !== null && timeout !== false) {
    const duration = Number(timeout) > 0 ? Number(timeout) : 4000;
    if (typeof window !== 'undefined') {
      setTimeout(() => removeToast(id), duration);
    }
  }

  return id;
}

export function removeToast(id) {
  toasts.update((items) => items.filter((toast) => toast.id !== id));
}

export function toastSuccess(message, options = {}) {
  return pushToast({ message, type: 'success', ...options });
}

export function toastError(message, options = {}) {
  return pushToast({
    message,
    type: 'error',
    timeout: options.timeout ?? 6000,
    ...options
  });
}

export function toastInfo(message, options = {}) {
  return pushToast({ message, type: 'info', ...options });
}
