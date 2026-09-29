import { vi } from 'vitest';

/** Mount point + acquireVsCodeApi stub; returns the messages the webview posts to the host. */
export function setupWebview(): unknown[] {
  document.body.innerHTML = '<div id="root"></div>';
  Element.prototype.scrollIntoView = () => {}; // not implemented by jsdom
  const posted: unknown[] = [];
  (globalThis as Record<string, unknown>).acquireVsCodeApi = () => ({ postMessage: (m: unknown) => posted.push(m) });
  return posted;
}

export function hostSends(msg: unknown): void {
  window.dispatchEvent(new MessageEvent('message', { data: msg }));
}

export const text = () => document.body.textContent ?? '';

export function button(label: string | RegExp): HTMLButtonElement {
  const b = [...document.querySelectorAll('button')].find((x) =>
    typeof label === 'string' ? x.textContent === label : label.test(x.textContent ?? ''),
  );
  if (!b) throw new Error(`no button ${label}; have: ${[...document.querySelectorAll('button')].map((x) => x.textContent).join(', ')}`);
  return b;
}

/** Set a React-controlled input/textarea value so onChange fires. */
export function typeInto(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

export const waitFor = vi.waitFor;
