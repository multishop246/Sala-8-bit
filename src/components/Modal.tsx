import { useEffect, type ReactNode } from 'react';

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onClose]);
  return (
    <div className="modal" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={'dlg' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={title}>
        <div className="hd"><h2>{title}</h2><button className="ghost sm" onClick={onClose} aria-label="Fechar">Fechar</button></div>
        {children}
      </div>
    </div>
  );
}
