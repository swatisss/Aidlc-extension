declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };

const api = acquireVsCodeApi();

export function post<T>(msg: T): void {
  api.postMessage(msg);
}

export function onMessage<T>(handler: (msg: T) => void): () => void {
  const listener = (e: MessageEvent) => handler(e.data as T);
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}
