'use client';
import { useEffect, useId, useRef } from 'react';

export function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose?: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { dialog.close(); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return <dialog ref={ref} aria-labelledby={titleId} className="modal" onCancel={(event) => { event.preventDefault(); onClose?.(); }}>
    <div className="mb-6 flex items-center justify-between gap-4"><h2 id={titleId} className="text-xl font-medium">{title}</h2>
      {onClose && <button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}>×</button>}
    </div>{children}
  </dialog>;
}
