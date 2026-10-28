import React from 'react';
import { css, cx } from '@emotion/css';

/** Grafana icon names used by the page, drawn with VS Code's codicons (Monaco ships the font). */
const CODICONS = {
  times: 'close',
  plus: 'add',
  favorite: 'star-full',
  star: 'star-empty',
  search: 'search',
  spinner: 'loading',
  'angle-down': 'chevron-down',
  'angle-up': 'chevron-up',
  'angle-left': 'chevron-left',
  'angle-right': 'chevron-right',
  'angle-double-down': 'fold-down',
  'angle-double-up': 'fold-up',
  'file-alt': 'file-code',
  link: 'link',
  'clock-nine': 'clock',
  'ellipsis-h': 'ellipsis',
  'ellipsis-v': 'kebab-vertical',
  save: 'save',
  copy: 'copy',
  edit: 'edit',
  'trash-alt': 'trash',
  play: 'play',
  'square-shape': 'debug-stop',
  'arrow-down': 'arrow-down',
  'arrow-up': 'arrow-up',
  'arrow-left': 'arrow-left',
  'arrow-right': 'arrow-right',
  'calendar-alt': 'calendar',
  'search-plus': 'zoom-in',
  'search-minus': 'zoom-out',
  filter: 'filter-filled',
  'eye-slash': 'eye-closed',
  columns: 'split-horizontal',
  pin: 'pinned',
  'arrows-v': 'unfold',
  'download-alt': 'desktop-download',
  sync: 'refresh',
  'plus-circle': 'diff-added',
  'minus-circle': 'diff-removed',
  'exclamation-triangle': 'warning',
  'exclamation-circle': 'error',
  'info-circle': 'info',
  check: 'check',
  cog: 'settings-gear',
  user: 'account',
  globe: 'globe',
} as const;

export type IconName = keyof typeof CODICONS;
export type IconSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZES: Record<IconSize, number> = { xs: 12, sm: 14, md: 16, lg: 18 };

interface Props extends React.HTMLAttributes<HTMLElement> {
  name: IconName;
  size?: IconSize;
}

export function Icon({ name, size = 'md', className, ...rest }: Props) {
  return (
    <i
      aria-hidden
      {...rest}
      className={cx(
        'codicon',
        `codicon-${CODICONS[name]}`,
        name === 'spinner' && 'codicon-modifier-spin',
        styles.icon,
        className
      )}
      style={{ fontSize: SIZES[size], ...rest.style }}
    />
  );
}

const styles = {
  icon: css({ display: 'inline-block', lineHeight: 1, flexShrink: 0, verticalAlign: 'middle' }),
};
