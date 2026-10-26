import { useEffect } from 'react';

export type ToastMessage = { id: number; text: string; undo?: () => void };

type Props = { toast: ToastMessage | null; onDone: () => void; className?: string };

export function Toast({ toast, onDone, className }: Props) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDone, 5000);
    return () => clearTimeout(t);
  }, [toast, onDone]);

  return (
    <div
      className={className ? `toast-slot ${className}` : 'toast-slot'}
      role="status"
      aria-live="polite"
    >
      {toast && (
        <div className="toast" key={toast.id}>
          <span>{toast.text}</span>
          {toast.undo && (
            <button
              type="button"
              className="toast-undo"
              onClick={() => {
                toast.undo?.();
                onDone();
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}
