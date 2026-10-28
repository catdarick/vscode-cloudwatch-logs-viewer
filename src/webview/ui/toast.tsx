import { useEffect, useState } from 'react';
import { css, cx } from '@emotion/css';
import { Theme, useStyles2 } from '../theme';
import { Icon } from './Icon';

interface Toast {
  id: number;
  kind: 'success' | 'error';
  text: string;
}

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<(toasts: Toast[]) => void>();

/** A short message in the corner, like Grafana's alerts after copying or saving. */
export function showToast(kind: Toast['kind'], text: string) {
  const toast = { id: nextId++, kind, text };
  toasts = [...toasts, toast].slice(-3);
  listeners.forEach((fn) => fn(toasts));
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== toast.id);
    listeners.forEach((fn) => fn(toasts));
  }, kind === 'error' ? 6000 : 2500);
}

export function Toasts() {
  const s = useStyles2(getStyles);
  const [list, setList] = useState(toasts);
  useEffect(() => {
    listeners.add(setList);
    return () => {
      listeners.delete(setList);
    };
  }, []);
  return (
    <div className={s.container}>
      {list.map((t) => (
        <div key={t.id} className={cx(s.toast, t.kind === 'error' && s.error)} role="status">
          <Icon name={t.kind === 'error' ? 'exclamation-circle' : 'check'} />
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}

const getStyles = (theme: Theme) => ({
  container: css({
    position: 'fixed',
    top: theme.spacing(2),
    right: theme.spacing(2),
    zIndex: theme.zIndex.toast,
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
    pointerEvents: 'none',
  }),
  toast: css({
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    minWidth: 200,
    padding: theme.spacing(1, 1.5),
    borderRadius: theme.shape.radius.default,
    border: `1px solid ${theme.colors.widget.border}`,
    borderLeft: '3px solid var(--vscode-testing-iconPassed, #73c991)',
    background: theme.colors.widget.background,
    color: theme.colors.widget.foreground,
    boxShadow: theme.shadows.z3,
  }),
  error: css({ borderLeftColor: theme.colors.error.main }),
});
