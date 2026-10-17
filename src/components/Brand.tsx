import { Avatar } from '../game/Avatar';

const LOGO = { sex: 'f' as const, skin: '#e0ac85', hair: '#3b2418', hs: 'coque', beard: 'nenhuma', acc: 'nenhum', out: 'blazer', oc: '#8b7bff' };

export function Brand({ sub }: { sub?: string }) {
  return (
    <div className="brand">
      <Avatar avatar={LOGO} size={30} />
      <h1>Sala 8-bit{sub && <small>{sub}</small>}</h1>
    </div>
  );
}
