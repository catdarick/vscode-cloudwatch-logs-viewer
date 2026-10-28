import { request } from '../host';
import { showToast } from '../ui/toast';

/** Copies through VS Code's clipboard, which works in webviews whatever the focus. */
export function copyText(text: string): Promise<void> {
  return request('copy', { text });
}

/** Copies and reports the outcome with a toast. */
export function copyWithToast(text: string, what = 'Copied') {
  copyText(text).then(
    () => showToast('success', what),
    () => showToast('error', 'Could not copy to the clipboard')
  );
}
