import * as models from './models.js';
import { load as loadSettings } from './settings.js';

const emitter = new EventTarget();
let lastQuoteTs = 0;

export function subscribe(handler) {
  emitter.addEventListener('show', handler);
  return () => emitter.removeEventListener('show', handler);
}

export async function list() {
  return models.listQuotes();
}

export async function add(data) {
  return models.createQuote(data);
}

export async function update(id, updates) {
  return models.updateQuote(id, updates);
}

export async function remove(id) {
  return models.deleteQuote(id);
}

export async function maybeShowAfterCompletion() {
  const settings = await loadSettings();
  const now = Date.now();
  const cooldownMs = (settings.quoteCooldownMinutes ?? 15) * 60000;
  if (now - lastQuoteTs < cooldownMs) return null;
  if (Math.random() >= (settings.quoteChance ?? 0.2)) return null;
  const quotes = await list();
  if (!quotes.length) return null;
  const quote = quotes[Math.floor(Math.random() * quotes.length)];
  lastQuoteTs = now;
  emitter.dispatchEvent(new CustomEvent('show', { detail: quote }));
  return quote;
}

export function resetCooldown() {
  lastQuoteTs = 0;
}

