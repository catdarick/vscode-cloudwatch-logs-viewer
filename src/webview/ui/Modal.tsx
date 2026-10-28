import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { css } from '@emotion/css';
import { Theme, useStyles2 } from '../theme';
import { IconButton } from './Button';

interface ModalProps {
  title: string;
  isOpen: boolean;
  onDismiss: () => void;
  children: React.ReactNode;
}

function ModalRoot({ title, isOpen, onDismiss, children }: ModalProps) {
  const s = useStyles2(getStyles);
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onDismiss();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onDismiss]);
  if (!isOpen) {
    return null;
  }
  return createPortal(
    <div className={s.backdrop} onMouseDown={(e) => e.target === e.currentTarget && onDismiss()}>
      <div className={s.modal} role="dialog" aria-modal aria-label={title}>
        <div className={s.header}>
          <h2 className={s.title}>{title}</h2>
          <IconButton name="times" aria-label="Close" onClick={onDismiss} />
        </div>
        <div className={s.content}>{children}</div>
      </div>
    </div>,
    document.body
  );
}

function ButtonRow({ children }: { children: React.ReactNode }) {
  const s = useStyles2(getStyles);
  return <div className={s.buttonRow}>{children}</div>;
}

export const Modal = Object.assign(ModalRoot, { ButtonRow });

const getStyles = (theme: Theme) => ({
  backdrop: css({
    position: 'fixed',
    inset: 0,
    zIndex: theme.zIndex.modal,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingTop: '10vh',
    background: 'rgba(0, 0, 0, 0.45)',
  }),
  modal: css({
    width: 'min(640px, calc(100vw - 32px))',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    border: `1px solid ${theme.colors.widget.border}`,
    borderRadius: theme.shape.radius.default,
    background: theme.colors.widget.background,
    color: theme.colors.widget.foreground,
    boxShadow: theme.shadows.z3,
  }),
  header: css({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing(1.5, 2),
    borderBottom: `1px solid ${theme.colors.border.weak}`,
  }),
  title: css({ margin: 0, fontSize: theme.typography.h5.fontSize, fontWeight: theme.typography.fontWeightMedium }),
  content: css({ padding: theme.spacing(2), overflowY: 'auto' }),
  buttonRow: css({
    display: 'flex',
    justifyContent: 'flex-end',
    gap: theme.spacing(1),
    paddingTop: theme.spacing(2),
  }),
});
