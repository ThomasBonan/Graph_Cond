<!--
  ToastContainer.svelte
  ----------------------------------------------------------------------------
  Affiche une pile de notifications globales (toasts) et gere leur disparition.
-->
<script>
  import { toasts, removeToast } from '../lib/toasts.js';
  import { fly } from 'svelte/transition';
</script>

<div class="toast-container" aria-live="polite" aria-atomic="true">
  {#each $toasts as toast (toast.id)}
    <div
      class="toast {toast.type}"
      role="status"
      transition:fly={{ x: 16, duration: 180 }}
    >
      <span>{toast.message}</span>
      <button
        type="button"
        class="toast-close"
        aria-label="Fermer la notification"
        on:click={() => removeToast(toast.id)}
      >
        &times;
      </button>
    </div>
  {/each}
</div>

<style>
  .toast-container {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 999;
    display: flex;
    flex-direction: column;
    gap: 8px;
    pointer-events: none;
  }
  .toast {
    min-width: 220px;
    max-width: 340px;
    padding: 10px 14px;
    border-radius: 10px;
    border: 1px solid rgba(15, 23, 42, 0.08);
    background: var(--toast-bg, #ffffff);
    color: var(--toast-text, #0f172a);
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.15);
    display: flex;
    align-items: flex-start;
    gap: 12px;
    pointer-events: auto;
  }
  .toast.success {
    border-color: rgba(22, 101, 52, 0.25);
    background: #dcfce7;
  }
  .toast.error {
    border-color: rgba(185, 28, 28, 0.25);
    background: #fee2e2;
  }
  .toast.info {
    border-color: rgba(37, 99, 235, 0.25);
    background: #dbeafe;
  }
  .toast span {
    flex: 1;
    font-size: 13px;
    line-height: 1.4;
  }
  .toast-close {
    border: none;
    background: transparent;
    color: inherit;
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
  }
  .toast-close:hover {
    opacity: 0.7;
  }
</style>
