import type { Color, Ply } from '../types';

// Secuencias de SAN (sin + ni #) -> nombre. Se elige la secuencia coincidente más larga.
const OPEN: [string, string][] = [
  ['e4 e5 Nf3 Nc6 Bb5', 'Española (Ruy López)'], ['e4 e5 Nf3 Nc6 Bc4', 'Italiana'], ['e4 e5 Nf3 Nc6 d4', 'Escocesa'],
  ['e4 e5 Nf3 Nf6', 'Defensa Petrov'], ['e4 e5 Nf3 Nc6', 'Partida abierta (Nf3 Nc6)'], ['e4 e5 Nf3 d6', 'Defensa Philidor'],
  ['e4 e5 f4', 'Gambito de Rey'], ['e4 e5 Nc3', 'Apertura de Viena'], ['e4 e5 Bc4', 'Apertura del Alfil'], ['e4 e5', 'Partida abierta'],
  ['e4 c5 Nf3 d6', 'Siciliana (Najdorf/Dragón/Scheveningen)'], ['e4 c5 Nf3 Nc6', 'Siciliana (Nc6)'], ['e4 c5 Nf3 e6', 'Siciliana (e6)'],
  ['e4 c5 Nc3', 'Siciliana cerrada'], ['e4 c5 c3', 'Siciliana Alapin'], ['e4 c5', 'Siciliana'],
  ['e4 c6 d4 d5 e5', 'Caro-Kann (Avance)'], ['e4 c6 d4 d5 exd5', 'Caro-Kann (Cambio)'],
  ['e4 c6 d4 d5 Nc3', 'Caro-Kann (Clásica)'], ['e4 c6 d4 d5 Nd2', 'Caro-Kann (Nd2)'], ['e4 c6 Bc4', 'Caro-Kann (Bc4)'],
  ['e4 c6 exd5', 'Caro-Kann (Cambio temprano)'], ['e4 c6', 'Caro-Kann'], ['e4 e6', 'Defensa Francesa'], ['e4 d5', 'Defensa Escandinava'],
  ['e4 d6', 'Defensa Pirc/Philidor'], ['e4 g6', 'Defensa Moderna'], ['e4 Nf6', 'Defensa Alekhine'], ['e4 Nc6', 'Defensa Nimzowitsch'],
  ['d4 d5 c4', 'Gambito de Dama'], ['d4 d5 Bf4', 'Sistema Londres'], ['d4 d5', 'Peón de Dama (d4 d5)'],
  ['d4 Nf6 Bf4', 'Sistema Londres'], ['d4 Nf6 c4', 'Defensas Indias'], ['d4 Nf6', 'Defensa India'],
  ['d4 c5 dxc5', '1.d4 c5 (2.dxc5)'], ['d4 c5 e3', '1.d4 c5 (2.e3)'], ['d4 c5', '1.d4 c5'],
  ['d4 e6', 'Defensa Francesa por d4'], ['d4 f5', 'Defensa Holandesa'],
  ['Nf3', 'Apertura Réti'], ['c4', 'Apertura Inglesa'], ['f4', 'Apertura Bird'], ['g3', 'Apertura Catalana/Larsen'], ['b3', 'Apertura Larsen'],
  ['e4', 'Otra con 1.e4'], ['d4', 'Otra con 1.d4'],
];

const PARSED = OPEN.map(([seq, name]) => ({ seq: seq.split(' '), name }));

export function openingName(plies: Pick<Ply, 'san'>[], userColor: Color): string {
  const sans = plies.slice(0, 12).map((p) => p.san.replace(/[+#]/g, ''));
  let best: { seq: string[]; name: string } | null = null;
  for (const o of PARSED) {
    if (o.seq.length <= sans.length && o.seq.every((m, i) => m === sans[i]) && (!best || o.seq.length > best.seq.length)) best = o;
  }
  const name = best ? best.name : 'Otra apertura';
  return (userColor === 'b' ? 'Con negras: ' : 'Con blancas: ') + name;
}

export const stripColor = (name: string) => name.replace(/^Con (blancas|negras): /, '');
