import { WebviewToExtensionMessage, ExtensionToWebviewMessage } from '../types/messages';

// Wrapper around the VS Code webview API (available globally in runtime).
declare const acquireVsCodeApi: () => any;
const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;

// Type-safe handler that automatically narrows message type
type MessageHandler<T extends ExtensionToWebviewMessage['type']> = (
  msg: Extract<ExtensionToWebviewMessage, { type: T }>
) => void;

type AnyHandler = (msg: ExtensionToWebviewMessage) => void;
const handlers: Record<string, AnyHandler[]> = {};

export function send(message: WebviewToExtensionMessage) {
  try {
    vscode?.postMessage(message);
  } catch (e) {
    // swallow – messaging failures should not crash UI
    console.warn('[messaging] postMessage failed', e);
  }
}

// Type-safe registration
export function on<T extends ExtensionToWebviewMessage['type']>(
  type: T,
  handler: MessageHandler<T>
) {
  if (!handlers[type]) handlers[type] = [];
  handlers[type].push(handler as AnyHandler);
}

export function initMessageListener() {
  window.addEventListener('message', (event: MessageEvent) => {
    const msg = event.data as ExtensionToWebviewMessage;
    if (!msg || typeof msg !== 'object' || !msg.type) return;
    const list = handlers[msg.type];
    if (list) {
      list.forEach(h => {
        try { h(msg); }
        catch (e) { console.error('handler error', e); }
      });
    }
  });
}
