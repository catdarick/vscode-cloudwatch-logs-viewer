import type { HostApi, HostEvent, HostMessage, HostMethod, SerializedError, WebviewMessage } from '../shared/messages';

interface VsCodeApi {
  postMessage(message: unknown): void;
  setState(state: unknown): void;
}

declare global {
  // Provided by VS Code inside webviews.
  function acquireVsCodeApi(): VsCodeApi;
  interface Window {
    /** A stand-in for the extension host, for running the page in a plain browser. */
    __devHost?: { request(method: string, params: unknown): Promise<unknown>; events: EventTarget };
  }
}

/** An error the host reported: the AWS exception's message and name. */
export class HostError extends Error {
  readonly cancelled: boolean;
  constructor(error: SerializedError) {
    super(error.message);
    this.name = error.name ?? 'Error';
    this.cancelled = Boolean(error.cancelled);
  }
}

const api: VsCodeApi | undefined = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : undefined;
// VS Code restores the panel after a restart only if it has state.
api?.setState({ restored: true });

const pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason: unknown) => void }>();
const listeners = new Set<(event: HostEvent) => void>();
let nextId = 1;

const inBrowser = typeof window !== 'undefined';

if (inBrowser) {
  window.addEventListener('message', (e: MessageEvent<HostMessage>) => {
    const msg = e.data;
    if (msg?.kind === 'response') {
      const entry = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) {
        entry?.reject(new HostError(msg.error));
      } else {
        entry?.resolve(msg.result);
      }
    } else if (msg?.kind === 'event') {
      listeners.forEach((fn) => fn(msg.event));
    }
  });
  window.__devHost?.events.addEventListener('host', (e) => listeners.forEach((fn) => fn((e as CustomEvent).detail)));
}

/** Asks the extension host to do something it can and the webview cannot (AWS, files, storage). */
export function request<M extends HostMethod>(
  method: M,
  params: Parameters<HostApi[M]>[0]
): Promise<ReturnType<HostApi[M]>> {
  if (!api) {
    const dev = inBrowser ? window.__devHost : undefined;
    if (!dev) {
      return Promise.reject(new Error('Not running inside VS Code'));
    }
    return dev.request(method, params).catch((e) => {
      throw new HostError(e);
    }) as Promise<ReturnType<HostApi[M]>>;
  }
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    const message: WebviewMessage = { kind: 'request', id, method, params };
    api.postMessage(message);
  });
}

/** Fire-and-forget: storage writes whose outcome the page does not wait for. */
export function notify<M extends HostMethod>(method: M, params: Parameters<HostApi[M]>[0]) {
  request(method, params).catch(() => undefined);
}

export function onHostEvent(fn: (event: HostEvent) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
