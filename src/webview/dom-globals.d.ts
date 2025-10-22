// Minimal DOM ambient declarations for webview TypeScript isolation.
// These are intentionally lightweight; when tsconfig.webview.json is introduced with lib DOM,
// these can be removed.

interface DOMTokenList { add(...tokens: string[]): void; remove(...tokens: string[]): void; }
interface HTMLElement {
  id: string;
  className: string;
  classList: DOMTokenList;
  textContent: string | null;
  dataset: Record<string, string>;
  offsetWidth: number;
  appendChild<T extends HTMLElement>(el: T): T;
  addEventListener(type: string, listener: (ev: any) => void): void;
}
interface NodeListOf<T> extends Array<T> {}
interface Document {
  getElementById(id: string): HTMLElement | null;
  createElement(tag: string): HTMLElement;
  querySelector(selector: string): HTMLElement | null;
  querySelectorAll(selector: string): NodeListOf<HTMLElement>;
  addEventListener(type: string, listener: (ev: any) => void): void;
  readyState: string;
}
interface Window { addEventListener(type: string, listener: (ev: any) => void): void; dispatchEvent(evt: any): boolean; }
interface MessageEvent { data: any; }
interface CustomEvent<T = any> { detail: T; }
declare var document: Document;
declare var window: Window;
declare var CustomEvent: {
  new <T = any>(type: string, init: { detail: T }): CustomEvent<T>;
};
