import React from 'react';
import { css, cx } from '@emotion/css';
import { Theme, useStyles2 } from '../theme';
import { Icon, IconName } from './Icon';
import { useCloseDropdown } from './popover';

function MenuRoot({ children }: { children: React.ReactNode }) {
  const s = useStyles2(getStyles);
  return (
    <div role="menu" className={s.menu}>
      {children}
    </div>
  );
}

interface ItemProps {
  label: string;
  description?: string;
  icon?: IconName;
  shortcut?: string;
  destructive?: boolean;
  onClick: () => void;
}

function MenuItem({ label, description, icon, shortcut, destructive, onClick }: ItemProps) {
  const s = useStyles2(getStyles);
  const close = useCloseDropdown();
  return (
    <button
      type="button"
      role="menuitem"
      className={cx(s.item, destructive && s.destructive)}
      onClick={() => {
        close();
        onClick();
      }}
    >
      <span className={s.icon}>{icon && <Icon name={icon} size="sm" />}</span>
      <span className={s.text}>
        <span>{label}</span>
        {description && <span className={s.description}>{description}</span>}
      </span>
      {shortcut && <span className={s.shortcut}>{shortcut}</span>}
    </button>
  );
}

function MenuDivider() {
  const s = useStyles2(getStyles);
  return <div role="separator" className={s.divider} />;
}

export const Menu = Object.assign(MenuRoot, { Item: MenuItem, Divider: MenuDivider });

const getStyles = (theme: Theme) => ({
  menu: css({ display: 'flex', flexDirection: 'column', minWidth: 200, maxWidth: 420 }),
  item: css({
    display: 'flex',
    alignItems: 'flex-start',
    gap: theme.spacing(1),
    padding: theme.spacing(0.75, 1.5),
    border: 'none',
    background: 'transparent',
    color: 'var(--vscode-menu-foreground, inherit)',
    textAlign: 'left',
    cursor: 'pointer',
    '&:hover, &:focus-visible': {
      background: 'var(--vscode-menu-selectionBackground, var(--vscode-list-activeSelectionBackground))',
      color: 'var(--vscode-menu-selectionForeground, var(--vscode-list-activeSelectionForeground))',
      outline: 'none',
    },
  }),
  destructive: css({ color: theme.colors.error.text }),
  icon: css({ width: 16, flexShrink: 0, display: 'flex', justifyContent: 'center', paddingTop: 1 }),
  text: css({ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }),
  description: css({ fontSize: theme.typography.bodySmall.fontSize, opacity: 0.75 }),
  shortcut: css({ paddingLeft: theme.spacing(2), fontSize: theme.typography.bodySmall.fontSize, opacity: 0.75 }),
  divider: css({
    height: 1,
    margin: theme.spacing(0.5, 0),
    background: 'var(--vscode-menu-separatorBackground, var(--vscode-widget-border, rgba(128,128,128,0.35)))',
  }),
});
