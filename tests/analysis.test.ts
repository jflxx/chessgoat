import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { ALGO_VERSION, MATE, aggregate, analyzeGame, classify, fen4, moveAccuracy, motifs, phaseOf, retagGame, winPct } from '../src/core/analysis';
import { recaptureGain } from '../src/core/see';
import { openingName } from '../src/core/openings';
import { parseGame } from '../src/core/pgn';
import { explainMove } from '../src/core/explain';
import type { EngineLike, EngineResult } from '../src/types';
import { PGN_ONE, PGN_TWO } from './fixtures';
import { NodeEngine } from './node-engine';

describe('winPct y precisión', () => {
  it('es simétrica y acotada', () => {
    expect(winPct(0)).toBeCloseTo(50, 5);
    expect(winPct(200) + winPct(-200)).toBeCloseTo(100, 5);
    expect(winPct(5000)).toBeLessThan(100);
    expect(winPct(5000)).toBeCloseTo(winPct(1000), 5);
    expect(winPct(100)).toBeGreaterThan(winPct(50));
  });
  it('moveAccuracy decrece con la pérdida', () => {
    expect(moveAccuracy(0)).toBeCloseTo(100, 0);
    expect(moveAccuracy(10)).toBeGreaterThan(moveAccuracy(30));
    expect(moveAccuracy(100)).toBeGreaterThanOrEqual(0);
    expect(moveAccuracy(-5)).toBeCloseTo(moveAccuracy(0), 5);
  });
});

describe('classify (imprecisión 10, error 20, error grave 30)', () => {
  it.each([
    [0, true, 'b'],
    [50, true, 'b'],
    [5, false, 'g'],
    [9.9, false, 'g'],
    [10, false, 'i'],
    [19.9, false, 'i'],
    [20, false, 'm'],
    [29.9, false, 'm'],
    [30, false, 'x'],
    [80, false, 'x'],
  ])('delta %s mejor=%s -> %s', (d, best, c) => {
    expect(classify(d as number, best as boolean)).toBe(c);
  });
});

describe('phaseOf y apertura', () => {
  it('apertura antes de la jugada 20; final con poco material', () => {
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(phaseOf(start, 5)).toBe('apertura');
    expect(phaseOf(start, 30)).toBe('medio');
    expect(phaseOf('4k3/pppp4/8/8/8/8/PPPP4/R3K2R w - - 0 40', 40)).toBe('final');
  });
  it('reconoce aperturas por la secuencia más larga', () => {
    const mk = (s: string) => s.split(' ').map((san) => ({ san }));
    expect(openingName(mk('e4 e5 Nf3 Nc6 Bb5 a6'), 'w')).toBe('Con blancas: Española (Ruy López)');
    expect(openingName(mk('e4 c5 Nf3 d6'), 'b')).toBe('Con negras: Siciliana (Najdorf/Dragón/Scheveningen)');
    expect(openingName(mk('a3 a6'), 'w')).toBe('Con blancas: Otra apertura');
  });
});

// ---------- motivos ----------
function after(fen: string, san: string) {
  const c = new Chess(fen);
  const m = c.move(san);
  return { ply: { uci: m.from + m.to + (m.promotion || ''), captured: m.captured || null, to: m.to, before: fen, after: c.fen() } };
}

describe('motifs: motivo del error', () => {
  it('pieza colgada: el alfil movido es capturado gratis', () => {
    const before = 'rnbqkbnr/pppp1ppp/8/4p3/8/3P4/PPP1PPPP/RNBQKBNR w KQkq - 0 2';
    const { ply } = after(before, 'Bf4');
    const r = motifs(ply, 'g1f3', 'e5f4', 25, 50, 30, -300, 'w');
    expect(r.primary).toBe('pieza_colgada');
    expect(r.x).toMatchObject({ r: 'exf4', k: 'b', hs: 'f4', mp: 1, bs: 'Nf3' });
  });

  it('mate: ataque al rey con mate del rival', () => {
    const before = 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3';
    const { ply } = after(before, 'Nf6');
    const r = motifs(ply, 'g7g6', 'h5f7', 90, 50, 0, MATE, 'b');
    expect(r.primary).toBe('mate_rey');
    expect(r.tags).toContain('mate_rey');
    expect(r.x.hs).toBe('e8');
    expect(r.x.r).toBe('Qxf7#');
  });

  it('horquilla: caballo rival ataca rey y torre', () => {
    const afterFen = '4k3/8/8/8/3n4/8/8/R3K3 b - - 0 1';
    const ply = { uci: 'a1a2', captured: null, to: 'a2', before: afterFen, after: afterFen };
    const r = motifs(ply, null, 'd4c2', 25, 50, 20, -400, 'w');
    expect(r.primary).toBe('horquilla');
    expect(r.x).toMatchObject({ hs: 'c2', fp: 'n' });
  });

  it('peón regalado', () => {
    // El peón e4 queda atacado por el caballo y sin defensa.
    const before = '4k3/8/5n2/8/8/8/4P3/4K3 w - - 0 1';
    const { ply } = after(before, 'e4');
    const r = motifs(ply, 'e1d2', 'f6e4', 22, 50, 25, -300, 'w');
    expect(r.tags).toContain('peon_perdido');
    expect(r.primary).toBe('peon_perdido');
  });

  it('captura perdida: había una captura mejor', () => {
    const before = '4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1';
    const { ply } = after(before, 'Kf2');
    const r = motifs(ply, 'd1d5', undefined, 40, 80, 50, 0, 'w');
    expect(r.tags).toContain('tactica_perdida');
    expect(r.x).toMatchObject({ bs: 'Rxd5', ms: 'cap' });
  });

  it('ventaja desperdiciada se añade como etiqueta secundaria', () => {
    const before = '4k3/8/8/8/8/8/8/4K2R w - - 0 1';
    const { ply } = after(before, 'Kd2');
    const r = motifs(ply, 'h1h8', undefined, 25, 90, 50, 0, 'w');
    expect(r.tags).toContain('ventaja_perdida');
  });

  it('sin motivo táctico es posicional', () => {
    const before = '4k3/8/8/8/8/8/8/4K2R w - - 0 1';
    const { ply } = after(before, 'Kd2');
    expect(motifs(ply, 'h1h7', undefined, 12, 55, 45, 0, 'w').primary).toBe('posicional');
  });

  it('explicaciones en español', () => {
    expect(explainMove({ s: 'Bf4', e: 0, c: 'x', p: 'pieza_colgada', mp: 1, r: 'exf4', bs: 'Nf3' })).toContain('exf4');
    expect(explainMove({ s: 'a3', e: 0, c: 'g' })).toBe('');
  });
});

// ---------- análisis completo con motor simulado ----------
function scripted(map: Record<string, EngineResult>): EngineLike {
  return { analyse: async (fen) => map[fen4(fen)] ?? { cp: 0, mate: null, pv: ['d2d4'], depth: 1 } };
}

describe('analyzeGame con motor simulado', () => {
  it('mate del usuario = mejores jugadas, victoria con negras', async () => {
    const g = parseGame(PGN_TWO)!;
    const eng = scripted({
      [fen4(g.plies[0].after)]: { cp: 50, mate: null, pv: ['e7e5'], depth: 1 },
      [fen4(g.plies[2].after)]: { cp: 900, mate: null, pv: ['d8h4'], depth: 1 },
    });
    const rec = await analyzeGame(g, 'alfredo', eng, 10);
    expect(rec).toMatchObject({ color: 'b', result: 'W', opp: 'rival2', elo: 1010, oppElo: 1100, n: 4, src: 'pgn' });
    expect(rec.counts).toMatchObject({ b: 2, x: 0, m: 0 });
    expect(rec.acc).toBe(100);
    expect(rec.moves[3].e).toBe(-MATE);
    expect(rec.opening).toBe('Con negras: Otra apertura');
  });

  it('registra un error grave con su motivo y la posición', async () => {
    const g = parseGame(PGN_TWO)!;
    const eng = scripted({
      [fen4(g.plies[0].after)]: { cp: 100, mate: null, pv: ['c7c5'], depth: 1 },
      [fen4(g.plies[1].after)]: { cp: 400, mate: null, pv: ['g2g4'], depth: 1 }, // blancas ganan tras 1...e5
    });
    const rec = await analyzeGame(g, 'alfredo', eng, 10);
    const m = rec.moves[1];
    expect(m.c).toBe('x');
    expect(m.b).toBe('c7c5');
    expect(m.bs).toBe('c5');
    expect(m.f).toBe(fen4(g.plies[0].after));
    expect(m.d).toBeGreaterThan(30);
    expect(rec.counts.x).toBe(1);
    expect(rec.first).toBe(1);
  });

  it('calcula el tiempo gastado por jugada', async () => {
    const g = parseGame(PGN_ONE)!;
    const rec = await analyzeGame(g, 'alfredo', scripted({}), 8);
    // blancas: reloj base 600; primera jugada 598.5 -> 1.5 s
    expect(rec.moves[0].sp).toBeCloseTo(1.5);
    expect(rec.moves[2].sp).toBeCloseTo(8.5); // 598.5 - 590
    expect(rec.moves[0].cl).toBeCloseTo(598.5);
  });

  it('cuenta los pasos del motor una vez por posición distinta', async () => {
    const g = parseGame(PGN_ONE)!;
    let steps = 0;
    await analyzeGame(g, 'alfredo', scripted({}), 8, () => steps++);
    expect(steps).toBe(7); // 8 posiciones, la última es mate
  });
});

describe('aggregate', () => {
  it('suma resultados, jugadas y motivos', async () => {
    const g = parseGame(PGN_TWO)!;
    const rec = await analyzeGame(g, 'alfredo', scripted({ [fen4(g.plies[1].after)]: { cp: 400, mate: null, pv: ['g2g4'], depth: 1 } }), 10);
    const A = aggregate([rec, rec]);
    expect(A.n).toBe(2);
    expect(A.W).toBe(2);
    expect(A.counts.x).toBe(2);
    expect(A.worst).toHaveLength(2);
    expect(aggregate([]).acc).toBe(0);
  });
});

describe('intercambios: una pieza defendida no está colgada', () => {
  it('recaptureGain cuenta las recapturas', () => {
    expect(recaptureGain('4k3/8/8/3n4/8/2N5/8/4K3 w - - 0 1', 'd5')).toBe(3); // Cxd5 gana el caballo
    expect(recaptureGain('4k3/8/8/3n4/8/8/8/4K3 w - - 0 1', 'd5')).toBe(0); // nadie puede capturar
    // peón d5 defendido por la dama: Cxd5 gana 1 pero Dxd5 recupera 3, así que no compensa
    expect(recaptureGain("3qk3/8/8/3p4/8/2N5/8/4K3 w - - 0 1", "d5")).toBe(0);
  });

  it('ofrecer un intercambio con defensor no es "pieza colgada"', () => {
    const before = '4k3/8/5n2/8/2B5/2N5/8/4K3 w - - 0 1'; // Ad5 está defendido por Cc3
    const { ply } = after(before, 'Bd5');
    const r = motifs(ply, 'c3d5', 'f6d5', 25, 50, 30, -50, 'w');
    expect(r.tags).not.toContain('pieza_colgada');
    expect(r.primary).not.toBe('pieza_colgada');
  });

  it('sin defensor sigue siendo pieza colgada', () => {
    const before = '4k3/8/5n2/8/2B5/8/8/4K3 w - - 0 1';
    const { ply } = after(before, 'Bd5');
    const r = motifs(ply, 'e1d2', 'f6d5', 25, 50, 30, -300, 'w');
    expect(r.primary).toBe('pieza_colgada');
    expect(r.x).toMatchObject({ k: 'b', hs: 'd5', mp: 1 });
  });

  it('un peón defendido tampoco es regalado', () => {
    const before = '4k3/8/5n2/8/8/3B4/4P3/4K3 w - - 0 1'; // e4 defendido por Ad3
    const { ply } = after(before, 'e4');
    const r = motifs(ply, 'e1d2', 'f6e4', 22, 50, 25, -100, 'w');
    expect(r.tags).not.toContain('peon_perdido');
  });
});

describe('verificación con más profundidad', () => {
  // El motor "exagera" a profundidad 10 y corrige a profundidad 14.
  const deepEngine = (g: ReturnType<typeof parseGame>): EngineLike => ({
    analyse: async (fen, depth): Promise<EngineResult> => {
      const k = fen4(fen);
      if (k === fen4(g!.plies[0].after)) return depth >= 14 ? { cp: 100, mate: null, pv: ['e7e5'], depth } : { cp: 100, mate: null, pv: ['c7c5'], depth };
      if (k === fen4(g!.plies[1].after)) return depth >= 14 ? { cp: -100, mate: null, pv: ['d2d4'], depth } : { cp: 400, mate: null, pv: ['g2g4'], depth };
      return { cp: 0, mate: null, pv: ['d2d4'], depth };
    },
  });

  it('un falso error grave se corrige al verificar', async () => {
    const g = parseGame(PGN_TWO)!;
    const sin = await analyzeGame(g, 'alfredo', deepEngine(g), 10, undefined, { verify: false });
    expect(sin.counts.x).toBe(1);
    const con = await analyzeGame(g, 'alfredo', deepEngine(g), 10);
    expect(con.counts.x).toBe(0);
    expect(con.counts.b).toBeGreaterThanOrEqual(1);
    expect(con.v).toBe(ALGO_VERSION);
  });

  it('un error real se mantiene tras verificar', async () => {
    const g = parseGame(PGN_TWO)!;
    const eng = scripted({
      [fen4(g.plies[0].after)]: { cp: 100, mate: null, pv: ['c7c5'], depth: 1 },
      [fen4(g.plies[1].after)]: { cp: 400, mate: null, pv: ['g2g4'], depth: 1 },
    });
    expect((await analyzeGame(g, 'alfredo', eng, 10)).counts.x).toBe(1);
  });
});

describe('retagGame (sin motor)', () => {
  it('recalcula las etiquetas con los datos guardados', async () => {
    const g = parseGame(PGN_TWO)!;
    const eng = scripted({
      [fen4(g.plies[0].after)]: { cp: 100, mate: null, pv: ['c7c5'], depth: 1 },
      [fen4(g.plies[1].after)]: { cp: 400, mate: null, pv: ['g2g4'], depth: 1 },
    });
    const rec = await analyzeGame(g, 'alfredo', eng, 10);
    const old = { ...rec, v: 1, moves: rec.moves.map((m, i) => (i === 1 ? { ...m, p: 'pieza_colgada' as const, t: ['pieza_colgada' as const], k: 'n' as const } : m)) };
    const fixed = retagGame(old);
    expect(fixed.v).toBe(ALGO_VERSION);
    expect(fixed.moves[1].p).toBe(rec.moves[1].p);
    expect(fixed.moves[1].k).toBe(rec.moves[1].k);
    expect(retagGame(rec).moves).toEqual(rec.moves); // idempotente
  });
});

// ---------- Stockfish real (WASM en Node) ----------
describe('con Stockfish real', () => {
  it('detecta una dama regalada como pieza colgada', async () => {
    const pgn = `[Event "t"]\n[Date "2026.01.01"]\n[White "yo"]\n[Black "el"]\n[Result "0-1"]\n\n1. e4 e5 2. Qh5 Nc6 3. Qxe5+ Nxe5 0-1`;
    const g = parseGame(pgn)!;
    const eng = new NodeEngine();
    try {
      await eng.init();
      const rec = await analyzeGame(g, 'yo', eng, 9);
      const m = rec.moves[4]; // 3. Qxe5+
      expect(m.c).toBe('x');
      expect(m.p).toBe('pieza_colgada');
      expect(m.k).toBe('q');
      expect(m.hs).toBe('e5');
      expect(explainMove(m)).toContain('Nxe5');
      expect(rec.result).toBe('L');
    } finally {
      eng.quit();
    }
  }, 120000);
});

// ---------- jugadas brillantes y geniales ----------
describe('Brillante y Genial', () => {
  const PGN_FRIED = `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2026.11.17"]
[White "alfredo"]
[Black "rival1"]
[Result "1-0"]
[WhiteElo "1000"]
[BlackElo "980"]
[TimeControl "600"]
[Link "https://www.chess.com/game/live/999999"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Nxd5 6. Nxf7 1-0
`;

  it('sacrificar una pieza que no se puede aprovechar es brillante', async () => {
    const g = parseGame(PGN_FRIED)!;
    const eng = scripted({
      [fen4(g.plies[9].after)]: { cp: 60, mate: null, pv: ['g5f7'], depth: 1 },
      [fen4(g.plies[10].after)]: { cp: -50, mate: null, pv: ['e8f7'], depth: 1 },
    });
    const rec = await analyzeGame(g, 'alfredo', eng, 10);
    expect(rec.moves[10].c).toBe('k');
    expect(rec.moves[10].sac).toBe('n');
    expect(rec.counts.k).toBe(1);
    expect(explainMove(rec.moves[10])).toContain('brillante');
  });

  it('la única buena jugada (la 2ª opción pierde mucho) es genial', async () => {
    const g = parseGame(PGN_FRIED)!;
    const line = (cp: number, pv: string[]) => ({ cp, mate: null, pv, depth: 1 });
    const eng: EngineLike = {
      analyse: async (fen, _d, mpv) => {
        const k = fen4(fen);
        if (k === fen4(g.plies[5].after)) return mpv === 2 ? { ...line(80, ['f3g5']), lines: [line(80, ['f3g5']), line(-150, ['d2d3'])] } : line(60, ['f3g5']);
        return line(60, ['d2d4']);
      },
    };
    const rec = await analyzeGame(g, 'alfredo', eng, 10);
    expect(rec.moves[6].c).toBe('h');
    expect(rec.counts.h).toBe(1);
  });

  it('con great:false no se busca genial', async () => {
    const g = parseGame(PGN_FRIED)!;
    let multi = 0;
    const eng: EngineLike = { analyse: async (_f, _d, mpv) => { if (mpv === 2) multi++; return { cp: 0, mate: null, pv: ['d2d4'], depth: 1 }; } };
    await analyzeGame(g, 'alfredo', eng, 10, undefined, { great: false });
    expect(multi).toBe(0);
  });
});
