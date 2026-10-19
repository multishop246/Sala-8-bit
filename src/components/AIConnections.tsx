import { useState } from 'react';
import { inApp, openIntegrations } from '../lib/desktop';
export function AIConnections() {
  const [error, setError] = useState('');
  if (!inApp()) return null;
  return <div><button className="ghost sm" onClick={() => openIntegrations().catch(() => setError('Atualize o aplicativo para a versão 0.6.0 para usar a configuração integrada.'))}>Conexões de IA</button>{error && <p role="alert" className="err">{error}</p>}</div>;
}
