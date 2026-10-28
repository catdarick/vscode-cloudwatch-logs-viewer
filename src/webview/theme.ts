import { injectGlobal } from '@emotion/css';

/**
 * Grafana's theme tokens, mapped onto VS Code's theme variables. The values are CSS variables, so
 * the page follows theme switches without re-creating any styles.
 */
const v = (name: string, fallback?: string) => (fallback ? `var(--vscode-${name}, ${fallback})` : `var(--vscode-${name})`);
/** `color` at `percent`% over `base`: tints that work in light, dark and high contrast themes. */
export const mix = (color: string, percent: number, base = 'transparent') =>
  `color-mix(in srgb, ${color} ${percent}%, ${base})`;

const fg = v('foreground');
const bg = v('editor-background');
const errorMain = v('editorError-foreground', '#f14c4c');
const warningMain = v('editorWarning-foreground', '#cca700');
const primaryMain = v('button-background');
const contrast = v('contrastBorder', 'transparent');

const GRID = 8;

export const theme = {
  /** 8px grid, like Grafana's theme.spacing: spacing(0.5, 1) is "4px 8px". */
  spacing: (...values: number[]) => values.map((n) => `${n * GRID}px`).join(' '),
  colors: {
    background: {
      canvas: bg,
      primary: bg,
      secondary: mix(fg, 6, bg),
    },
    text: {
      primary: fg,
      secondary: v('descriptionForeground'),
      disabled: v('disabledForeground', mix(fg, 45)),
      link: v('textLink-foreground'),
    },
    primary: {
      main: primaryMain,
      contrastText: v('button-foreground'),
      text: v('textLink-foreground'),
      border: v('focusBorder'),
      transparent: mix(primaryMain, 18),
      shade: v('button-hoverBackground'),
    },
    secondary: {
      main: v('button-secondaryBackground', mix(fg, 14, bg)),
      contrastText: v('button-secondaryForeground', fg),
      shade: v('button-secondaryHoverBackground', mix(fg, 20, bg)),
    },
    error: {
      main: errorMain,
      text: v('errorForeground', errorMain),
      transparent: mix(errorMain, 16),
      border: v('inputValidation-errorBorder', errorMain),
    },
    warning: {
      main: warningMain,
      text: warningMain,
      transparent: mix(warningMain, 20),
    },
    border: {
      weak: `var(--vscode-contrastBorder, ${mix(fg, 14)})`,
      medium: `var(--vscode-contrastBorder, ${mix(fg, 24)})`,
      strong: `var(--vscode-contrastActiveBorder, ${mix(fg, 42)})`,
    },
    action: {
      hover: v('list-hoverBackground', mix(fg, 8)),
      selected: v('list-inactiveSelectionBackground', mix(fg, 12)),
    },
    widget: {
      background: v('editorWidget-background', bg),
      foreground: v('editorWidget-foreground', fg),
      border: v('editorWidget-border', mix(fg, 20)),
    },
    contrast,
  },
  typography: {
    fontFamily: v('font-family', 'system-ui, sans-serif'),
    fontFamilyMonospace: v('editor-font-family', 'monospace'),
    fontSize: '13px',
    bodySmall: { fontSize: '12px' },
    h5: { fontSize: '14px' },
    fontWeightRegular: 400,
    fontWeightMedium: 500,
    fontWeightBold: 600,
  },
  shape: { radius: { default: '3px', pill: '9999px' } },
  shadows: {
    z2: `0 2px 8px ${v('widget-shadow', 'rgba(0, 0, 0, 0.3)')}`,
    z3: `0 4px 16px ${v('widget-shadow', 'rgba(0, 0, 0, 0.36)')}`,
  },
  zIndex: { dropdown: 1030, modal: 1060, tooltip: 1070, toast: 1080 },
  breakpoints: {
    down: (bp: 'md' | 'lg') => `@media (max-width: ${bp === 'lg' ? 1199 : 899}px)`,
  },
  components: {
    input: {
      background: v('input-background'),
      text: v('input-foreground', fg),
      borderColor: v('input-border', mix(fg, 24)),
      borderHover: mix(fg, 42),
      placeholder: v('input-placeholderForeground', v('descriptionForeground')),
    },
    /** Value colours of the JSON view, from the debugger's: they come with every theme. */
    json: {
      string: v('debugTokenExpression-string', '#ce9178'),
      number: v('debugTokenExpression-number', '#b5cea8'),
      boolean: v('debugTokenExpression-boolean', '#4e94ce'),
    },
  },
};

export type Theme = typeof theme;

const cache = new WeakMap<(theme: Theme) => unknown, unknown>();

/** Grafana's useStyles2: the class names of getStyles, made once (the theme never changes). */
export function useStyles2<T>(getStyles: (theme: Theme) => T): T {
  let styles = cache.get(getStyles) as T | undefined;
  if (!styles) {
    styles = getStyles(theme);
    cache.set(getStyles, styles);
  }
  return styles;
}

export function useTheme2(): Theme {
  return theme;
}

export function injectBaseStyles() {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  injectGlobal({
    // The page is exactly the window: only the results table scrolls (see App's page style).
    'html, body, #root': { height: '100%' },
    'html, body': {
      margin: 0,
      padding: 0,
      overflow: 'hidden',
      background: theme.colors.background.canvas,
      color: theme.colors.text.primary,
      fontFamily: theme.typography.fontFamily,
      fontSize: theme.typography.fontSize,
    },
    // Native controls (scrollbars, the time input) in the theme's light or dark.
    'body.vscode-dark, body.vscode-high-contrast:not(.vscode-high-contrast-light)': { colorScheme: 'dark' },
    'body.vscode-light, body.vscode-high-contrast-light': { colorScheme: 'light' },
    '*, *::before, *::after': { boxSizing: 'border-box' },
    'button, input, select, textarea': { fontFamily: 'inherit', fontSize: 'inherit', color: 'inherit' },
    h5: { fontSize: theme.typography.h5.fontSize, fontWeight: theme.typography.fontWeightMedium },
    a: { color: theme.colors.text.link },
    ':focus-visible': { outline: `1px solid ${theme.colors.primary.border}`, outlineOffset: -1 },
    '::selection': { background: v('editor-selectionBackground') },
  });
}
