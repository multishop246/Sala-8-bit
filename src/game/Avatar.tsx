import { useEffect, useRef } from 'react';
import type { Avatar as AvatarT } from '../lib/types';
import { DEFAULT_AVATAR, drawPerson } from './sprites';

interface Props { avatar: Partial<AvatarT>; crown?: boolean; stand?: boolean; size?: number; className?: string; title?: string }

/** Personagem em pixel art desenhado num canvas pequeno e ampliado sem borrar. */
export function Avatar({ avatar, crown, stand, size = 48, className, title }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const top = crown ? 4 : 0;
  const h = (stand ? 26 : 16) + top;
  useEffect(() => {
    const c = ref.current?.getContext('2d');
    if (!c) return;
    c.clearRect(0, 0, 12, h);
    drawPerson(c, 0, top, { ...DEFAULT_AVATAR, ...avatar }, { stand, crown });
  }, [avatar, crown, stand, h, top]);
  return <canvas ref={ref} width={12} height={h} className={'px ' + (className || '')} style={{ width: size, height: size * h / 12 }} role="img" aria-label={title || 'Personagem'} title={title} />;
}
