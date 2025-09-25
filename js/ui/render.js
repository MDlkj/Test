export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (key === 'className') {
      el.className = value;
    } else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'dataset') {
      for (const [dataKey, dataValue] of Object.entries(value)) {
        el.dataset[dataKey] = dataValue;
      }
    } else if (key === 'aria') {
      for (const [ariaKey, ariaValue] of Object.entries(value)) {
        el.setAttribute(`aria-${ariaKey}`, ariaValue);
      }
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(el.style, value);
    } else if (value !== undefined && value !== null) {
      el.setAttribute(key, value);
    }
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined) continue;
    if (child instanceof Node) {
      el.appendChild(child);
    } else {
      el.appendChild(document.createTextNode(String(child)));
    }
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

export function iconDot(color) {
  const dot = document.createElement('span');
  dot.style.display = 'inline-block';
  dot.style.width = '10px';
  dot.style.height = '10px';
  dot.style.borderRadius = '50%';
  dot.style.background = color;
  return dot;
}

