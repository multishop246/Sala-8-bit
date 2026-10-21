import { useId } from 'react';
import type { Avatar as AvatarT } from '../lib/types';
import { DEFAULT_AVATAR, shade } from './sprites';
import { THEME, themeVariant } from './themes';

interface Props { avatar: Partial<AvatarT>; crown?: boolean; stand?: boolean; size?: number; className?: string; title?: string }

/** Smooth miniature portrait uses the same colors, outfits and themes as the 3D rig. */
export function Avatar({ avatar, crown, stand, size = 48, className, title }: Props) {
  const id = useId().replace(/:/g, ''), a = { ...DEFAULT_AVATAR, ...avatar };
  const th = a.theme && THEME[a.theme] ? themeVariant(THEME[a.theme], a.vi || 0) : undefined;
  const color = th?.b || a.oc, skin = th?.skin || a.skin, h = stand ? 100 : 76;
  return <svg viewBox={`0 0 64 ${h}`} className={'avatar-modern ' + (className || '')} style={{ width: size, height: size * h / 64, flexShrink: 0 }} role="img" aria-label={title || 'Personagem'}>
    {title && <title>{title}</title>}
    <defs><linearGradient id={id + 's'} x2="1" y2="1"><stop stopColor={skin} /><stop offset="1" stopColor={shade(skin, -.18)} /></linearGradient><linearGradient id={id + 'c'} x2="1" y2="1"><stop stopColor={shade(color, .16)} /><stop offset="1" stopColor={shade(color, -.2)} /></linearGradient><linearGradient id={id + 'h'} x2="1" y2="1"><stop stopColor={shade(a.hair, .2)} /><stop offset="1" stopColor={a.hair} /></linearGradient></defs>
    {stand && <><ellipse cx="32" cy="96" rx="20" ry="3" fill="#0003" /><rect x="20" y="69" width="10" height="24" rx="3" fill="#3d435a" /><rect x="34" y="69" width="10" height="24" rx="3" fill="#343a4f" /><rect x="18" y="88" width="13" height="7" rx="3" fill="#202638" /><rect x="33" y="88" width="13" height="7" rx="3" fill="#202638" /></>}
    {['longo', 'cacheado', 'rabo'].includes(a.hs) && <rect x="10" y="20" width="44" height="39" rx="13" fill={a.hair} />}
    <rect x="13" y="49" width="38" height="26" rx="10" fill={`url(#${id}c)`} /><rect x="7" y="52" width="10" height="21" rx="5" fill={`url(#${id}s)`} /><rect x="47" y="52" width="10" height="21" rx="5" fill={`url(#${id}s)`} />
    {['blazer', 'terno', 'social', 'cardiga'].includes(a.out) && <path d="M25 50h14l-7 21z" fill="#eee9e1" />}
    <rect x="27" y="44" width="10" height="10" rx="3" fill={`url(#${id}s)`} />
    <rect x="11" y="14" width="42" height="36" rx="13" fill={`url(#${id}s)`} />
    <ellipse cx="23" cy="32" rx="2.4" ry="3" fill="#252336" /><ellipse cx="41" cy="32" rx="2.4" ry="3" fill="#252336" /><circle cx="23.6" cy="31" r=".8" fill="#fff" /><circle cx="41.6" cy="31" r=".8" fill="#fff" />
    <path d="M28 41q4 3 8 0" fill="none" stroke="#a75f60" strokeWidth="1.8" strokeLinecap="round" />
    {a.beard !== 'nenhuma' && <path d={a.beard === 'bigode' ? 'M23 38q9-6 18 0q-9 4-18 0' : 'M16 35q3 15 16 16q14-1 16-16l-6 6H22z'} fill={a.hair} />}
    {a.hs !== 'careca' && <><path d="M11 30V22Q10 7 30 8q25-1 24 19l-7-7q-11 5-28 0l-2 13z" fill={`url(#${id}h)`} />{a.hs === 'franja' && <path d="M17 17h30l-9 13-5-8-14 8z" fill={a.hair} />}{a.hs === 'coque' && <circle cx="32" cy="8" r="7" fill={a.hair} />}</>}
    {(crown || a.theme?.startsWith('ttl_')) && <path d="M15 12l-2-10 11 6 8-8 8 8 11-6-2 10v5H15z" fill="#efc361" stroke="#c59c45" />}
    {a.acc === 'relogio' && <rect x="48" y="64" width="8" height="4" rx="1" fill="#d8bb7c" />}
  </svg>;
}
