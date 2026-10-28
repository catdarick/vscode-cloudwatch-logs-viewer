import React from 'react';
import { css, cx } from '@emotion/css';
import { Theme, useStyles2 } from '../theme';
import { Icon, IconName } from './Icon';

interface CheckboxProps {
  value: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  label?: React.ReactNode;
  className?: string;
}

/** A checkbox with its label; the label text is the last span, as in Grafana's. */
export function Checkbox({ value, onChange, label, className }: CheckboxProps) {
  const s = useStyles2(getStyles);
  return (
    <label className={cx(s.checkbox, label === undefined && s.bare, className)}>
      <input type="checkbox" className={s.box} checked={value} onChange={onChange} />
      {label !== undefined && <span className={s.label}>{label}</span>}
    </label>
  );
}

interface FieldProps {
  label: string;
  description?: string;
  children: React.ReactNode;
}

export function Field({ label, description, children }: FieldProps) {
  const s = useStyles2(getStyles);
  return (
    <div className={s.field}>
      <div className={s.fieldLabel}>{label}</div>
      {description && <div className={s.fieldDescription}>{description}</div>}
      {children}
    </div>
  );
}

interface RadioOption<T> {
  label: string;
  value: T;
  description?: string;
  icon?: IconName;
}

interface RadioButtonGroupProps<T> {
  value: T;
  options: Array<RadioOption<T>>;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  'aria-label'?: string;
}

export function RadioButtonGroup<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
  'aria-label': label,
}: RadioButtonGroupProps<T>) {
  const s = useStyles2(getStyles);
  return (
    <div className={cx(s.radioGroup, size === 'sm' && s.radioGroupSmall)} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          title={o.description}
          className={cx(s.radio, size === 'sm' && s.radioSmall, o.value === value && s.radioSelected)}
          onClick={() => onChange(o.value)}
        >
          {o.icon && <Icon name={o.icon} size="sm" />}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

interface AlertProps {
  severity: 'error' | 'warning' | 'info';
  title: string;
  children?: React.ReactNode;
}

export function Alert({ severity, title, children }: AlertProps) {
  const s = useStyles2(getStyles);
  const icon = severity === 'error' ? 'exclamation-circle' : severity === 'warning' ? 'exclamation-triangle' : 'info-circle';
  return (
    <div className={cx(s.alert, s.alertSeverity[severity])} role={severity === 'error' ? 'alert' : 'status'}>
      <Icon name={icon} size="lg" className={s.alertIcon} />
      <div className={s.alertBody}>
        <div className={s.alertTitle}>{title}</div>
        {children !== undefined && <div className={s.alertText}>{children}</div>}
      </div>
    </div>
  );
}

export function Spinner({ size = 'sm' }: { size?: 'xs' | 'sm' | 'md'; inline?: boolean }) {
  return <Icon name="spinner" size={size} />;
}

const getStyles = (theme: Theme) => ({
  checkbox: css({
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    alignItems: 'center',
    gap: theme.spacing(1),
    minWidth: 0,
    cursor: 'pointer',
  }),
  bare: css({ display: 'inline-grid', gridTemplateColumns: 'auto' }),
  box: css({
    width: 14,
    height: 14,
    margin: 0,
    accentColor: theme.colors.primary.main,
    cursor: 'pointer',
  }),
  label: css({ minWidth: 0 }),
  field: css({ display: 'flex', flexDirection: 'column', gap: theme.spacing(0.5), marginBottom: theme.spacing(2) }),
  fieldLabel: css({ fontWeight: theme.typography.fontWeightMedium }),
  fieldDescription: css({ color: theme.colors.text.secondary, fontSize: theme.typography.bodySmall.fontSize }),
  radioGroup: css({
    display: 'inline-flex',
    gap: theme.spacing(0.5),
    padding: 2,
    border: `1px solid ${theme.colors.border.weak}`,
    borderRadius: theme.shape.radius.default,
    background: theme.colors.background.secondary,
  }),
  radioGroupSmall: css({ gap: 2, padding: 1 }),
  radio: css({
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    height: theme.spacing(3.5),
    padding: theme.spacing(0, 1.5),
    border: 'none',
    borderRadius: theme.shape.radius.default,
    background: 'transparent',
    color: theme.colors.text.secondary,
    cursor: 'pointer',
    '&:hover': { color: theme.colors.text.primary, background: theme.colors.action.hover },
  }),
  radioSmall: css({ height: 22, padding: theme.spacing(0, 1), fontSize: theme.typography.bodySmall.fontSize }),
  radioSelected: css({
    background: `${theme.colors.primary.main} !important`,
    color: `${theme.colors.primary.contrastText} !important`,
  }),
  alert: css({
    display: 'flex',
    gap: theme.spacing(1.5),
    padding: theme.spacing(1.5, 2),
    borderRadius: theme.shape.radius.default,
    borderLeft: '3px solid',
  }),
  alertSeverity: {
    error: css({ background: theme.colors.error.transparent, borderLeftColor: theme.colors.error.main }),
    warning: css({ background: theme.colors.warning.transparent, borderLeftColor: theme.colors.warning.main }),
    info: css({ background: theme.colors.primary.transparent, borderLeftColor: theme.colors.primary.main }),
  },
  alertIcon: css({ marginTop: 1 }),
  alertBody: css({ display: 'flex', flexDirection: 'column', gap: theme.spacing(0.5), minWidth: 0 }),
  alertTitle: css({ fontWeight: theme.typography.fontWeightMedium }),
  alertText: css({ whiteSpace: 'pre-wrap', wordBreak: 'break-word', userSelect: 'text' }),
});
