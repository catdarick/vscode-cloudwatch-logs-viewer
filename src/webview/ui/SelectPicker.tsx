import React, { useMemo, useState } from 'react';
import { css, cx } from '@emotion/css';
import { Theme, useStyles2 } from '../theme';
import { Icon, IconName } from './Icon';
import { FilterInput } from './Input';
import { Toggletip } from './popover';

export interface PickerOption {
  value: string;
  label: string;
  /** Shown on the right, e.g. a zone's offset. */
  detail?: string;
}

interface Props {
  value: string;
  options: PickerOption[];
  onChange: (value: string) => void;
  /** Width of the button in 8px grid units. */
  width: number;
  icon?: IconName;
  searchPlaceholder: string;
  /** Called when the list opens, e.g. to reload it. */
  onOpen?: () => void;
  /** Under the list: how to get more options. */
  footer?: React.ReactNode;
  title?: string;
}

/** A button showing the current choice that opens a searchable list: Grafana's pickers. */
export function SelectPicker({ value, options, onChange, width, icon, searchPlaceholder, onOpen, footer, title }: Props) {
  const s = useStyles2(getStyles);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const current = options.find((o) => o.value === value);
  const needle = search.trim().toLowerCase();
  const shown = useMemo(
    () =>
      needle
        ? options.filter((o) => `${o.label} ${o.value} ${o.detail ?? ''}`.toLowerCase().includes(needle))
        : options,
    [options, needle]
  );

  const list = (
    <div className={s.menu}>
      <FilterInput autoFocus placeholder={searchPlaceholder} value={search} onChange={setSearch} />
      <ul className={s.list} role="listbox">
        {shown.slice(0, 400).map((o) => (
          <li key={o.value}>
            <button
              type="button"
              role="option"
              aria-selected={o.value === value}
              className={cx(s.option, o.value === value && s.selected)}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              <span className={s.label}>{o.label}</span>
              {o.detail && <span className={s.detail}>{o.detail}</span>}
            </button>
          </li>
        ))}
        {shown.length === 0 && <li className={s.empty}>Nothing found</li>}
      </ul>
      {footer && <div className={s.footer}>{footer}</div>}
    </div>
  );

  return (
    <Toggletip
      placement="bottom-end"
      show={open}
      onOpen={() => {
        setSearch('');
        setOpen(true);
        onOpen?.();
      }}
      onClose={() => setOpen(false)}
      content={list}
    >
      <button type="button" className={s.button} style={{ width: width * 8 }} title={title}>
        {icon && <Icon name={icon} size="sm" />}
        <span className={s.value}>{current?.label ?? value}</span>
        <Icon name="angle-down" size="sm" />
      </button>
    </Toggletip>
  );
}

const getStyles = (theme: Theme) => ({
  button: css({
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    height: theme.spacing(4),
    padding: theme.spacing(0, 1),
    border: `1px solid ${theme.components.input.borderColor}`,
    borderRadius: theme.shape.radius.default,
    background: theme.components.input.background,
    color: theme.components.input.text,
    textAlign: 'left',
    cursor: 'pointer',
    '&:hover': { borderColor: theme.components.input.borderHover },
  }),
  value: css({ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }),
  menu: css({ width: 340, display: 'flex', flexDirection: 'column', gap: theme.spacing(1) }),
  list: css({ listStyle: 'none', margin: 0, padding: 0, maxHeight: 360, overflowY: 'auto' }),
  option: css({
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    width: '100%',
    padding: theme.spacing(0.5, 1),
    border: 'none',
    borderRadius: theme.shape.radius.default,
    background: 'transparent',
    color: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
    '&:hover': { background: theme.colors.action.hover },
  }),
  selected: css({ background: theme.colors.action.selected }),
  label: css({ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }),
  detail: css({ color: theme.colors.text.secondary, fontSize: theme.typography.bodySmall.fontSize, flexShrink: 0 }),
  empty: css({ padding: theme.spacing(1), color: theme.colors.text.secondary }),
  footer: css({
    paddingTop: theme.spacing(1),
    borderTop: `1px solid ${theme.colors.border.weak}`,
    color: theme.colors.text.secondary,
    fontSize: theme.typography.bodySmall.fontSize,
  }),
});
