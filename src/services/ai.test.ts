import { HttpAiProvider, MockAiProvider } from './ai';

describe('MockAiProvider', () => {
  const ai = new MockAiProvider(0);
  const praia = { placeName: 'Praia Central', cityName: 'Balneário Camboriú', category: 'beach' as const, mediaType: 'image' as const, takenAt: new Date(2026, 9, 8, 16) };

  it('sugere as 4 legendas pedidas: casual, engraçada, turística e curta', async () => {
    const s = await ai.suggestCaptions(praia);
    expect(s.map((x) => x.tone)).toEqual(['casual', 'funny', 'tourist', 'short']);
    expect(s.every((x) => x.text.length > 3)).toBe(true);
    expect(s[0].text).toContain('Praia Central');
    expect(s[2].text).toContain('Balneário Camboriú');
  });
  it('é determinístico para a mesma entrada', async () => {
    expect(await ai.suggestCaptions(praia)).toEqual(await ai.suggestCaptions(praia));
  });
  it('funciona sem lugar escolhido', async () => {
    const s = await ai.suggestCaptions({ mediaType: 'image' });
    expect(s).toHaveLength(4);
    expect(s.some((x) => x.text.includes('{'))).toBe(false);
  });
  it('resumo da viagem usa os números', async () => {
    const text = await ai.summarizeTrip({ origin: 'Jaraguá do Sul', destination: 'Balneário Camboriú', distanceM: 128_000, durationS: 6120, stopCount: 2, momentCount: 17 });
    expect(text).toContain('128 km');
    expect(text).toContain('Jaraguá do Sul');
    expect(text).toContain('Balneário Camboriú');
    expect(text).toContain('2 paradas');
    expect(text).toContain('17 momentos');
  });
  it('vídeo da viagem ainda não existe e diz isso', async () => {
    expect((await ai.createTripVideo()).status).toBe('unavailable');
  });
});

describe('HttpAiProvider', () => {
  it('usa o endpoint e cai no mock quando ele falha', async () => {
    const calls: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      calls.push(String(url));
      return { ok: false, status: 500, json: async () => ({}) };
    }) as unknown as typeof fetch;
    try {
      const ai = new HttpAiProvider('https://ai.example.dev/', new MockAiProvider(0));
      const s = await ai.suggestCaptions({ placeName: 'Praia Mole', mediaType: 'image' });
      expect(calls[0]).toBe('https://ai.example.dev/captions');
      expect(s).toHaveLength(4);
      globalThis.fetch = (async () => ({ ok: true, status: 200, json: async () => ({ summary: ' Resumo do servidor. ' }) })) as unknown as typeof fetch;
      expect(await ai.summarizeTrip({ origin: 'A', distanceM: 1, durationS: 1, stopCount: 0, momentCount: 0 })).toBe('Resumo do servidor.');
    } finally {
      globalThis.fetch = original;
    }
  });
});
