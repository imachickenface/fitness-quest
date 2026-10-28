import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon.tsx';

type Props = {
  title: string;
  /** leave out for a step that must be finished: no close button, Escape and the backdrop do nothing */
  onClose?: () => void;
  children: ReactNode;
};

/** A bottom sheet built on <dialog>: focus trap, Escape to close, backdrop tap to close. */
export function Sheet({ title, onClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose?.();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose?.();
      }}
    >
      <div className="sheet-body">
        <header className="sheet-head">
          <h2>{title}</h2>
          {onClose && (
            <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
              <Icon name="close" />
            </button>
          )}
        </header>
        {children}
      </div>
    </dialog>
  );
}
