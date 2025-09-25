import { h } from './render.js';

const root = document.getElementById('toastRoot');

export function showToast(message, { duration = 3500 } = {}) {
  if (!root) return;
  const toast = h('div', { className: 'toast', role: 'status' }, message);
  root.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, duration);
}

