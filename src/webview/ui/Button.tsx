import React, { forwardRef } from 'react';
import { css, cx } from '@emotion/css';
import { Theme, mix, useStyles2 } from '../theme';
import { copyWithToast } from '../utils/clipboard';
import { Icon, IconName, IconSize } from './Icon';
import { Tooltip } from './popover';

type Variant = 'primary' | 'secondary' | 'destructive';
type Fill = 'solid' | 'outline' | 'text';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  variant?: Variant;
  fill?: Fill;
  size?: Size;
  icon?: IconName;
  fullWidth?: boolean;
  tooltip?: React.ReactNode;
  type?: 'button' | 'submit';
}

const ICON_SIZE: Record<Size, IconSize> = { sm: 'sm', md: 'md', lg: 'lg' };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', fill = 'solid', size = 'md', icon, fullWidth, tooltip, className, children, type = 'button', ...rest },
  ref
) {
  const s = useStyles2(getButtonStyles);
  const button = (
    <button
      ref={ref}
      type={type}
      className={cx(s.button, s.size[size], s.variant[fill === 'solid' ? variant : fill], fullWidth && s.fullWidth, className)}
      {...rest}
    >
      {icon && <Icon name={icon} size={ICON_SIZE[size]} />}
      {children !== undefined && children !== null && <span className={s.label}>{children}</span>}
    </button>
  );
  return tooltip ? <Tooltip content={tooltip}>{button}</Tooltip> : button;
});

const getButtonStyles = (theme: Theme) => ({
  button: css({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing(0.75),
    border: '1px solid transparent',
    borderRadius: theme.shape.radius.default,
    fontWeight: theme.typography.fontWeightMedium,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    userSelect: 'none',
    '&:disabled': { opacity: 0.5, cursor: 'not-allowed' },
  }),
  label: css({ overflow: 'hidden', textOverflow: 'ellipsis' }),
  fullWidth: css({ width: '100%' }),
  size: {
    sm: css({ height: theme.spacing(3), padding: theme.spacing(0, 1), fontSize: theme.typography.bodySmall.fontSize }),
    md: css({ height: theme.spacing(4), padding: theme.spacing(0, 1.5) }),
    lg: css({ height: theme.spacing(5), padding: theme.spacing(0, 2), fontSize: theme.typography.h5.fontSize }),
  },
  variant: {
    primary: css({
      background: theme.colors.primary.main,
      color: theme.colors.primary.contrastText,
      borderColor: theme.colors.contrast,
      '&:hover:enabled': { background: theme.colors.primary.shade },
    }),
    secondary: css({
      background: theme.colors.secondary.main,
      color: theme.colors.secondary.contrastText,
      borderColor: theme.colors.contrast,
      '&:hover:enabled': { background: theme.colors.secondary.shade },
    }),
    destructive: css({
      background: theme.colors.error.main,
      color: '#fff',
      '&:hover:enabled': { background: mix(theme.colors.error.main, 85, '#000') },
    }),
    outline: css({
      background: 'transparent',
      color: theme.colors.text.primary,
      borderColor: theme.colors.border.medium,
      '&:hover:enabled': { background: theme.colors.action.hover, borderColor: theme.colors.border.strong },
    }),
    text: css({
      background: 'transparent',
      color: theme.colors.text.secondary,
      '&:hover:enabled': { background: theme.colors.action.hover, color: theme.colors.text.primary },
    }),
  },
});

export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  name: IconName;
  size?: IconSize;
  tooltip?: React.ReactNode;
  [data: `data-${string}`]: unknown;
}

const HIT: Record<IconSize, number> = { xs: 16, sm: 20, md: 24, lg: 28 };

/** A borderless icon; the tooltip doubles as its accessible name. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { name, size = 'md', tooltip, className, ...rest },
  ref
) {
  const s = useStyles2(getIconButtonStyles);
  const button = (
    <button
      ref={ref}
      type="button"
      aria-label={rest['aria-label'] ?? (typeof tooltip === 'string' ? tooltip : undefined)}
      className={cx(s.button, className)}
      style={{ width: HIT[size], height: HIT[size] }}
      {...rest}
    >
      <Icon name={name} size={size} />
    </button>
  );
  return tooltip ? <Tooltip content={tooltip}>{button}</Tooltip> : button;
});

const getIconButtonStyles = (theme: Theme) => ({
  button: css({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    padding: 0,
    border: 'none',
    borderRadius: theme.shape.radius.default,
    background: 'transparent',
    color: 'inherit',
    opacity: 0.85,
    cursor: 'pointer',
    '&:hover:enabled': { opacity: 1, background: theme.colors.action.hover },
    '&:disabled': { opacity: 0.35, cursor: 'not-allowed' },
  }),
});

interface ClipboardButtonProps extends Omit<ButtonProps, 'onClick'> {
  getText: () => string;
}

export function ClipboardButton({ getText, ...rest }: ClipboardButtonProps) {
  return <Button {...rest} onClick={() => copyWithToast(getText())} />;
}
