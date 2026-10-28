import React, { cloneElement, createContext, useContext, useState } from 'react';
import { css, cx } from '@emotion/css';
import {
  FloatingPortal,
  Placement,
  autoUpdate,
  flip,
  offset,
  safePolygon,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useMergeRefs,
  useRole,
} from '@floating-ui/react';
import { Theme, useStyles2 } from '../theme';

type Trigger = React.ReactElement<Record<string, unknown>>;

/** Opens on click with its trigger; a click outside or Escape closes it. Controlled when `show` is set. */
function useClickPopover({
  show,
  onOpen,
  onClose,
  placement,
  role,
}: {
  show?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
  placement: Placement;
  role: 'dialog' | 'menu';
}) {
  const [internal, setInternal] = useState(false);
  const open = show ?? internal;
  const setOpen = (next: boolean) => {
    if (show === undefined) {
      setInternal(next);
    }
    next ? onOpen?.() : onClose?.();
  };
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });
  const { getReferenceProps, getFloatingProps } = useInteractions([
    useClick(context),
    useDismiss(context),
    useRole(context, { role }),
  ]);
  return { open, setOpen, refs, floatingStyles, getReferenceProps, getFloatingProps };
}

/** The trigger with the popup's props and ref, keeping a ref it already has (an IconButton's tooltip). */
function useTrigger(children: Trigger, setReference: (el: Element | null) => void, props: Record<string, unknown>) {
  const ref = useMergeRefs([setReference, (children as unknown as { ref?: React.Ref<Element> }).ref]);
  return cloneElement(children, { ...props, ref });
}

interface ToggletipProps {
  content: React.ReactNode;
  children: Trigger;
  placement?: Placement;
  show?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
  /** Grafana's options; the popup here always fits its content and has no close button. */
  fitContent?: boolean;
  closeButton?: boolean;
}

/** Grafana's Toggletip: a popup with any content, opened by clicking its trigger. */
export function Toggletip({ content, children, placement = 'bottom', show, onOpen, onClose }: ToggletipProps) {
  const s = useStyles2(getStyles);
  const p = useClickPopover({ show, onOpen, onClose, placement, role: 'dialog' });
  const trigger = useTrigger(children, p.refs.setReference, p.getReferenceProps(children.props));
  return (
    <>
      {trigger}
      {p.open && (
        <FloatingPortal>
          <div ref={p.refs.setFloating} style={p.floatingStyles} className={s.toggletip} {...p.getFloatingProps()}>
            {content}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

const CloseContext = createContext<() => void>(() => undefined);

/** Closes the Dropdown a menu item is in. */
export const useCloseDropdown = () => useContext(CloseContext);

interface DropdownProps {
  overlay: React.ReactNode;
  children: Trigger;
  placement?: Placement;
}

/** Grafana's Dropdown: a menu opened by clicking its trigger; choosing an item closes it. */
export function Dropdown({ overlay, children, placement = 'bottom-start' }: DropdownProps) {
  const s = useStyles2(getStyles);
  const p = useClickPopover({ placement, role: 'menu' });
  const trigger = useTrigger(children, p.refs.setReference, p.getReferenceProps(children.props));
  return (
    <>
      {trigger}
      {p.open && (
        <FloatingPortal>
          <CloseContext.Provider value={() => p.setOpen(false)}>
            <div ref={p.refs.setFloating} style={p.floatingStyles} className={s.dropdown} {...p.getFloatingProps()}>
              {overlay}
            </div>
          </CloseContext.Provider>
        </FloatingPortal>
      )}
    </>
  );
}

interface TooltipProps {
  content: React.ReactNode;
  children: Trigger;
  placement?: Placement;
  /** The pointer can move into the tooltip, e.g. to follow a link in it. */
  interactive?: boolean;
}

export function Tooltip({ content, children, placement = 'top', interactive }: TooltipProps) {
  const s = useStyles2(getStyles);
  const [open, setOpen] = useState(false);
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });
  const { getReferenceProps, getFloatingProps } = useInteractions([
    useHover(context, { delay: { open: 250, close: interactive ? 150 : 0 }, handleClose: interactive ? safePolygon() : null }),
    useFocus(context, { visibleOnly: true }),
    useDismiss(context),
    useRole(context, { role: 'tooltip' }),
  ]);
  const trigger = useTrigger(children, refs.setReference, getReferenceProps(children.props));
  if (content === undefined || content === null || content === '') {
    return children;
  }
  return (
    <>
      {trigger}
      {open && (
        <FloatingPortal>
          <div ref={refs.setFloating} style={floatingStyles} className={cx(s.tooltip)} {...getFloatingProps()}>
            {content}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

const getStyles = (theme: Theme) => {
  const popup = {
    zIndex: theme.zIndex.dropdown,
    border: `1px solid ${theme.colors.widget.border}`,
    borderRadius: theme.shape.radius.default,
    background: theme.colors.widget.background,
    color: theme.colors.widget.foreground,
    boxShadow: theme.shadows.z3,
    fontSize: theme.typography.fontSize,
  };
  return {
    toggletip: css({ ...popup, padding: theme.spacing(1.5), maxWidth: 'calc(100vw - 16px)' }),
    dropdown: css({ ...popup, padding: theme.spacing(0.5, 0) }),
    tooltip: css({
      ...popup,
      zIndex: theme.zIndex.tooltip,
      maxWidth: 360,
      padding: theme.spacing(0.5, 1),
      fontSize: theme.typography.bodySmall.fontSize,
      lineHeight: 1.5,
      boxShadow: theme.shadows.z2,
    }),
  };
};
