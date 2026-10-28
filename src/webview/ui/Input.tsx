import React, { forwardRef } from 'react';
import { css, cx } from '@emotion/css';
import { Theme, useStyles2 } from '../theme';
import { IconButton } from './Button';
import { Icon } from './Icon';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix' | 'width'> {
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  /** Width in 8px grid units, like Grafana's Input. */
  width?: number;
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { prefix, suffix, width, invalid, className, ...rest },
  ref
) {
  const s = useStyles2(getInputStyles);
  return (
    <div className={cx(s.wrapper, invalid && s.invalid, className)} style={{ width: width ? width * 8 : '100%' }}>
      {prefix !== undefined && prefix !== null && <span className={s.prefix}>{prefix}</span>}
      <input ref={ref} className={s.input} spellCheck={false} autoComplete="off" {...rest} />
      {suffix !== undefined && suffix !== null && <span className={s.suffix}>{suffix}</span>}
    </div>
  );
});

export const getInputStyles = (theme: Theme) => ({
  wrapper: css({
    display: 'flex',
    alignItems: 'center',
    minWidth: 0,
    height: theme.spacing(4),
    border: `1px solid ${theme.components.input.borderColor}`,
    borderRadius: theme.shape.radius.default,
    background: theme.components.input.background,
    color: theme.components.input.text,
    '&:hover': { borderColor: theme.components.input.borderHover },
    '&:focus-within': { borderColor: theme.colors.primary.border },
  }),
  invalid: css({ borderColor: `${theme.colors.error.border} !important` }),
  input: css({
    flex: 1,
    minWidth: 0,
    height: '100%',
    padding: theme.spacing(0, 1),
    border: 'none',
    outline: 'none',
    background: 'transparent',
    color: 'inherit',
    '&::placeholder': { color: theme.components.input.placeholder },
    '&:focus-visible': { outline: 'none' },
  }),
  prefix: css({
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    paddingLeft: theme.spacing(1),
    color: theme.colors.text.secondary,
    whiteSpace: 'nowrap',
  }),
  suffix: css({
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    paddingRight: theme.spacing(0.5),
    color: theme.colors.text.secondary,
  }),
});

interface FilterInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

/** A search field with a clear button. */
export function FilterInput({ value, onChange, placeholder, autoFocus }: FilterInputProps) {
  return (
    <Input
      autoFocus={autoFocus}
      value={value}
      placeholder={placeholder}
      prefix={<Icon name="search" size="sm" />}
      onChange={(e) => onChange(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && value) {
          e.stopPropagation();
          onChange('');
        }
      }}
      suffix={value ? <IconButton name="times" size="sm" aria-label="Clear" onClick={() => onChange('')} /> : null}
    />
  );
}
