/** PRNG determinístico — as cenas e os dados de demonstração precisam ser reproduzíveis. */

export function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rand: () => number, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)];
}

let counter = 0;
/** ID local para dados mock (no Supabase o ID vem do banco, uuid). */
export function localId(prefix: string): string {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}
