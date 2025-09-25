import { h, clear } from './render.js';

const modalRoot = document.getElementById('modalRoot');
let activeClose = null;

function closeModal() {
  if (!modalRoot) return;
  modalRoot.classList.remove('active');
  clear(modalRoot);
  if (activeClose) {
    document.removeEventListener('keydown', activeClose);
    activeClose = null;
  }
}

export function showModal({ title, content, actions = [] }) {
  if (!modalRoot) return () => {};
  clear(modalRoot);
  const modal = h('div', { className: 'modal', role: 'dialog', aria: { modal: 'true' } });
  const header = h('header');
  header.appendChild(h('h3', {}, title));
  const closeBtn = h('button', { className: 'icon secondary', aria: { label: 'Close' }, onclick: closeModal }, '×');
  header.appendChild(closeBtn);
  modal.appendChild(header);
  const body = h('div', { className: 'modal-body' });
  if (typeof content === 'string') {
    body.textContent = content;
  } else if (content instanceof Node) {
    body.appendChild(content);
  } else if (Array.isArray(content)) {
    content.forEach((node) => {
      if (node instanceof Node) body.appendChild(node);
    });
  }
  modal.appendChild(body);
  if (actions.length) {
    const footer = h('footer');
    actions.forEach((action) => {
      const btn = h('button', { className: action.variant === 'secondary' ? 'secondary' : '', onclick: async () => {
        if (action.onClick) {
          const result = await action.onClick();
          if (result !== false) closeModal();
        } else {
          closeModal();
        }
      } }, action.label);
      footer.appendChild(btn);
    });
    modal.appendChild(footer);
  }
  modalRoot.appendChild(modal);
  modalRoot.classList.add('active');
  const keyHandler = (event) => {
    if (event.key === 'Escape') {
      closeModal();
    }
  };
  document.addEventListener('keydown', keyHandler);
  activeClose = keyHandler;
  return closeModal;
}

modalRoot?.addEventListener('click', (event) => {
  if (event.target === modalRoot) {
    closeModal();
  }
});

export function promptForm({ title, fields, submitLabel = 'Save', onSubmit }) {
  const form = h('form');
  fields.forEach((field) => {
    const wrapper = h('div', { className: 'form-field' });
    const label = h('label', { for: field.id }, field.label);
    let input;
    if (field.type === 'textarea') {
      input = h('textarea', { id: field.id, value: field.value ?? '', rows: field.rows ?? 3 });
    } else if (field.type === 'select') {
      input = h('select', { id: field.id });
      (field.options || []).forEach((option) => {
        const opt = h('option', { value: option.value }, option.label);
        if (option.value === field.value) opt.selected = true;
        input.appendChild(opt);
      });
    } else {
      input = h('input', { id: field.id, type: field.type ?? 'text', value: field.value ?? '', placeholder: field.placeholder ?? '' });
    }
    if (field.required) {
      input.required = true;
    }
    wrapper.appendChild(label);
    wrapper.appendChild(input);
    form.appendChild(wrapper);
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = {};
    fields.forEach((field) => {
      const element = form.querySelector(`#${field.id}`);
      if (field.type === 'number') {
        data[field.name || field.id] = Number(element.value);
      } else {
        data[field.name || field.id] = element.value;
      }
    });
    if (onSubmit) {
      const result = await onSubmit(data);
      if (result !== false) {
        closeModal();
      }
    } else {
      closeModal();
    }
  });
  showModal({
    title,
    content: form,
    actions: [
      { label: 'Cancel', variant: 'secondary', onClick: () => {} },
      { label: submitLabel, onClick: () => form.requestSubmit() },
    ],
  });
}

export function confirm({ title, body, confirmLabel = 'Confirm', onConfirm }) {
  showModal({
    title,
    content: typeof body === 'string' ? h('p', {}, body) : body,
    actions: [
      { label: 'Cancel', variant: 'secondary', onClick: () => {} },
      { label: confirmLabel, onClick: async () => {
        if (onConfirm) {
          await onConfirm();
        }
      } },
    ],
  });
}

