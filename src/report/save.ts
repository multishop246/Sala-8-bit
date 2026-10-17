// Salvar o relatório numa pasta escolhida (Chrome e Edge, no computador) ou baixar o arquivo.
type DirHandle = { name: string; queryPermission?: (o: object) => Promise<string>; requestPermission?: (o: object) => Promise<string>; getFileHandle: (n: string, o: object) => Promise<{ createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }> }> };
const DB = 'sala8bit-pasta', STORE = 'h', KEY = 'relatorios';

export const canPickFolder = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return new Promise((res, rej) => {
    const o = indexedDB.open(DB, 1);
    o.onupgradeneeded = () => o.result.createObjectStore(STORE);
    o.onerror = () => rej(o.error);
    o.onsuccess = () => {
      const tx = o.result.transaction(STORE, mode), st = tx.objectStore(STORE), r = fn(st);
      tx.oncomplete = () => res(r ? (r as IDBRequest<T>).result : undefined);
      tx.onerror = () => rej(tx.error);
    };
  });
}

export async function pickFolder(): Promise<string | null> {
  if (!canPickFolder()) return null;
  try {
    const h = await (window as unknown as { showDirectoryPicker: (o: object) => Promise<DirHandle> }).showDirectoryPicker({ mode: 'readwrite', id: 'sala8bit-relatorios' });
    await idb('readwrite', s => { s.put(h, KEY); });
    return h.name;
  } catch { return null; }
}
export async function savedFolderName() { try { return (await idb<DirHandle>('readonly', s => s.get(KEY)))?.name || null; } catch { return null; } }

/** Tenta gravar na pasta escolhida; se não der, baixa o arquivo. Retorna onde salvou. */
export async function saveFile(blob: Blob, name: string): Promise<{ where: 'pasta' | 'download'; folder?: string }> {
  try {
    const h = await idb<DirHandle>('readonly', s => s.get(KEY));
    if (h) {
      let perm = (await h.queryPermission?.({ mode: 'readwrite' })) || 'granted';
      if (perm !== 'granted') perm = (await h.requestPermission?.({ mode: 'readwrite' })) || 'denied';
      if (perm === 'granted') {
        const f = await h.getFileHandle(name, { create: true });
        const w = await f.createWritable(); await w.write(blob); await w.close();
        return { where: 'pasta', folder: h.name };
      }
    }
  } catch { /* cai para o download */ }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return { where: 'download' };
}
