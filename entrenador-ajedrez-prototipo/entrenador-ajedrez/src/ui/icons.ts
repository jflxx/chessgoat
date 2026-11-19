// Iconos propios en estilo "pegatina": formas llenas con dos tonos y una base más oscura, colores vivos
// que se leen igual sobre fondo claro y oscuro. Dibujados para ChessGOAT (viewBox 32 x 32).
const W = (inner: string, label = '') => `<svg class="ico" viewBox="0 0 32 32" aria-hidden="true" focusable="false" data-i="${label}">${inner}</svg>`;

const C = {
  gold: '#f2b632', goldD: '#b9791a', red: '#e2574c', redD: '#a52e2a', blue: '#4a8fe0', blueD: '#2a5aa0', green: '#58b368', greenD: '#2f7a3f',
  cream: '#f4ead2', creamD: '#cdbf9c', brown: '#8a5a33', brownD: '#5e3a1c', gray: '#9aa3ad', grayD: '#5f6872', orange: '#f28a2e', teal: '#3fb8ae', tealD: '#217d76',
};

function boardIcon(): string {
  let sq = '';
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) sq += `<rect x="${6 + c * 5}" y="${6 + r * 5}" width="5" height="5" fill="${(r + c) % 2 ? C.brown : C.cream}"/>`;
  return `<rect x="3.5" y="5" width="25" height="25" rx="3.5" fill="${C.brownD}"/><rect x="3.5" y="3.5" width="25" height="25" rx="3.5" fill="${C.goldD}"/><rect x="5" y="5" width="22" height="22" rx="2" fill="${C.cream}"/>${sq}`;
}

function gear(): string {
  let teeth = '';
  for (let i = 0; i < 8; i++) teeth += `<rect x="13.5" y="2.5" width="5" height="6" rx="1.2" fill="${C.gray}" transform="rotate(${i * 45} 16 16)"/>`;
  return `<g transform="translate(0 1.4)" fill="${C.grayD}"><circle cx="16" cy="16" r="9.5"/>${teeth.replace(/fill="[^"]+"/g, `fill="${C.grayD}"`)}</g>${teeth}<circle cx="16" cy="16" r="9.5" fill="${C.gray}"/><circle cx="16" cy="16" r="3.6" fill="#3a3f46"/>`;
}

const ICONS: Record<string, string> = {
  inicio: `<rect x="7" y="15.5" width="18" height="13.5" rx="1.5" fill="${C.creamD}"/><rect x="7" y="14" width="18" height="13.5" rx="1.5" fill="${C.cream}"/><path d="M2.5 15.5 16 3.8l13.5 11.7z" fill="${C.redD}"/><path d="M2.5 14 16 2.3 29.5 14z" fill="${C.red}"/><rect x="13.5" y="18.5" width="5" height="9" rx="1" fill="${C.brown}"/>`,
  plan: `<rect x="5.5" y="5.5" width="21" height="25" rx="3" fill="${C.brownD}"/><rect x="5.5" y="4" width="21" height="25" rx="3" fill="${C.brown}"/><rect x="8" y="7.5" width="16" height="19" rx="1.5" fill="${C.cream}"/><path d="M11 13.5l2.2 2.2 4-4.6" fill="none" stroke="${C.green}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M11 21h10" stroke="${C.gray}" stroke-width="2" stroke-linecap="round"/><rect x="11.5" y="2.2" width="9" height="5.5" rx="1.6" fill="${C.gold}"/><rect x="11.5" y="6" width="9" height="1.7" rx=".8" fill="${C.goldD}"/>`,
  repaso: `<path d="M16 6.5a10 10 0 1 0 9.6 7.2" fill="none" stroke="${C.blueD}" stroke-width="4.6" stroke-linecap="round" transform="translate(0 1.4)"/><path d="M16 6.5a10 10 0 1 0 9.6 7.2" fill="none" stroke="${C.blue}" stroke-width="4.6" stroke-linecap="round"/><path d="M26.5 3v11.2H15.3z" fill="${C.blue}"/><circle cx="16" cy="16.5" r="3" fill="${C.gold}"/>`,
  puzzles: `<path d="M5.5 12.5h7a3.2 3.2 0 1 1 6.4 0h6.6v7a3.2 3.2 0 1 0 0 6.4V30H5.5z" fill="${C.goldD}"/><path d="M5.5 11h7a3.2 3.2 0 1 1 6.4 0h6.6v7a3.2 3.2 0 1 0 0 6.4v3H5.5z" fill="${C.gold}"/><path d="M8.5 14.5h4" stroke="#fff6d8" stroke-width="2" stroke-linecap="round" opacity=".7"/>`,
  partidas: boardIcon(),
  informe: `<rect x="5" y="17.5" width="6" height="11" rx="1.4" fill="${C.blue}"/><rect x="13" y="9.5" width="6" height="19" rx="1.4" fill="${C.green}"/><rect x="21" y="13.5" width="6" height="15" rx="1.4" fill="${C.gold}"/><rect x="3.5" y="28" width="25" height="2.4" rx="1.2" fill="${C.grayD}"/>`,
  progreso: `<path d="M8.5 5.5h15v8a7.5 7.5 0 0 1-15 0z" fill="${C.goldD}" transform="translate(0 1.3)"/><path d="M8.5 5h15v8a7.5 7.5 0 0 1-15 0z" fill="${C.gold}"/><path d="M8.5 8H5.2c0 4 1.6 6 4 6.4M23.5 8h3.3c0 4-1.6 6-4 6.4" fill="none" stroke="${C.goldD}" stroke-width="2"/><rect x="14.5" y="19" width="3" height="5" fill="${C.goldD}"/><rect x="9.5" y="24" width="13" height="4.4" rx="1.4" fill="${C.brown}"/><path d="M12 8.2c0 3 1.2 5 3 6" stroke="#fff6d8" stroke-width="1.8" stroke-linecap="round" opacity=".7" fill="none"/>`,
  importar: `<rect x="4.5" y="24.5" width="23" height="5" rx="1.8" fill="${C.brownD}"/><rect x="4.5" y="23.3" width="23" height="5" rx="1.8" fill="${C.brown}"/><path d="M12 3.5h8v9.5h5.6L16 22.4 6.4 13H12z" fill="${C.greenD}" transform="translate(0 1.3)"/><path d="M12 3h8v9.5h5.6L16 21.9 6.4 12.5H12z" fill="${C.green}"/>`,
  ajustes: gear(),
  mas: `<rect x="4.5" y="5.5" width="10" height="10" rx="2.4" fill="${C.blue}"/><rect x="17.5" y="5.5" width="10" height="10" rx="2.4" fill="${C.red}"/><rect x="4.5" y="18.5" width="10" height="10" rx="2.4" fill="${C.green}"/><rect x="17.5" y="18.5" width="10" height="10" rx="2.4" fill="${C.gold}"/>`,
  racha: `<path d="M16 2.5c1.2 6 8 9 8 17a8 8 0 0 1-16 0c0-3.4 2.2-5.8 3.4-8 1.2 2.2 2.4 3.2 3.4 3.2 1.4-3.4.2-8 1.2-12.2z" fill="${C.orange}"/><path d="M16 14c.7 3.4 3.6 4.6 3.6 8a3.6 3.6 0 0 1-7.2 0c0-2.4 2.4-3.6 3.6-8z" fill="#f7d65a"/>`,
  lupa: `<circle cx="13.5" cy="13.5" r="9" fill="${C.blueD}" transform="translate(0 1.3)"/><circle cx="13.5" cy="13.5" r="9" fill="#cfe6ff" stroke="${C.blue}" stroke-width="3.2"/><path d="M20.5 20.5l8 8" stroke="${C.brown}" stroke-width="4.4" stroke-linecap="round"/><path d="M9.5 11a5 5 0 0 1 4-3.4" stroke="#fff" stroke-width="2" stroke-linecap="round" fill="none"/>`,
  estrella: `<path d="M16 2.6l3.8 8 8.7 1.1-6.4 6 1.7 8.7L16 22.2l-7.8 4.2 1.7-8.7-6.4-6 8.7-1.1z" fill="${C.goldD}" transform="translate(0 1.4)"/><path d="M16 2.6l3.8 8 8.7 1.1-6.4 6 1.7 8.7L16 22.2l-7.8 4.2 1.7-8.7-6.4-6 8.7-1.1z" fill="${C.gold}"/>`,
  luna: `<path d="M21 3.5a12.5 12.5 0 1 0 8 21.4A10.5 10.5 0 0 1 21 3.5z" fill="#9db7e8"/><path d="M21 3.5a12.5 12.5 0 0 0-8.5 21.4" stroke="#c8d8f6" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="26" cy="7" r="1.4" fill="${C.gold}"/><circle cx="29" cy="13" r="1" fill="${C.gold}"/>`,
  web: `<circle cx="16" cy="17" r="12.5" fill="${C.blueD}"/><circle cx="16" cy="15.7" r="12.5" fill="${C.blue}"/><path d="M8 11c3-1 5 0 6 2s-1 3-3 4-2 3 0 5M20 7c-1 3 1 4 3 4s3 2 2 4" fill="none" stroke="${C.green}" stroke-width="3" stroke-linecap="round"/>`,
  pieza: `<path d="M16 3.5a5 5 0 0 1 3.2 8.8c3.4 2 5.6 6 5.6 11.2H7.2c0-5.2 2.2-9.2 5.6-11.2A5 5 0 0 1 16 3.5z" fill="${C.redD}" transform="translate(0 1.3)"/><path d="M16 3a5 5 0 0 1 3.2 8.8c3.4 2 5.6 6 5.6 11.2H7.2c0-5.2 2.2-9.2 5.6-11.2A5 5 0 0 1 16 3z" fill="${C.red}"/><rect x="5.5" y="24" width="21" height="4.5" rx="1.6" fill="${C.brown}"/><path d="M13.5 8.5a3 3 0 0 1 2-1.6" stroke="#ffd7d2" stroke-width="1.8" stroke-linecap="round" fill="none"/>`,
  corona: `<path d="M3.5 24.5 2.5 10.5l7 6L16 5l6.5 11.5 7-6-1 14z" fill="${C.goldD}" transform="translate(0 1.4)"/><path d="M3.5 24.5 2.5 10.5l7 6L16 5l6.5 11.5 7-6-1 14z" fill="${C.gold}"/><rect x="4" y="24.5" width="24" height="3.6" rx="1.4" fill="${C.orange}"/><circle cx="16" cy="5" r="1.8" fill="#fff6d8"/><circle cx="2.8" cy="10.2" r="1.6" fill="#fff6d8"/><circle cx="29.2" cy="10.2" r="1.6" fill="#fff6d8"/>`,
  reloj: `<rect x="6" y="3" width="20" height="3.6" rx="1.4" fill="${C.brown}"/><rect x="6" y="25.4" width="20" height="3.6" rx="1.4" fill="${C.brown}"/><path d="M8.5 6.6h15c0 5-3.4 7-5.4 9.4 2 2.4 5.4 4.4 5.4 9.4h-15c0-5 3.4-7 5.4-9.4-2-2.4-5.4-4.4-5.4-9.4z" fill="#d8ecff" stroke="${C.blue}" stroke-width="1.6"/><path d="M11 9.5h10c-.6 2.4-2.4 3.4-5 5.2-2.6-1.8-4.4-2.8-5-5.2z" fill="${C.gold}"/><path d="M16 17.5v3" stroke="${C.gold}" stroke-width="2.2"/><path d="M12 25.4h8c-.6-2-2-3-4-4-2 1-3.4 2-4 4z" fill="${C.gold}"/>`,
  libro: `<path d="M3 7.5c4-1.6 8.4-1.4 13 1.6v18.4c-4.6-3-9-3.2-13-1.6z" fill="${C.blueD}"/><path d="M29 7.5c-4-1.6-8.4-1.4-13 1.6v18.4c4.6-3 9-3.2 13-1.6z" fill="${C.blue}"/><path d="M5 9.5c3-.8 6.4-.4 9.5 1.6v14.4c-3-1.6-6.4-2-9.5-1.2z" fill="${C.cream}"/><path d="M27 9.5c-3-.8-6.4-.4-9.5 1.6v14.4c3-1.6 6.4-2 9.5-1.2z" fill="#fff8e6"/><path d="M7.5 13c1.8-.2 3.6 0 5 .8M7.5 16.5c1.8-.2 3.6 0 5 .8" stroke="${C.creamD}" stroke-width="1.4" stroke-linecap="round" fill="none"/>`,
  cuenta: `<path d="M6 28V10l10-6 10 6v18z" fill="${C.creamD}"/><rect x="6" y="9" width="20" height="18" rx="2" fill="${C.cream}"/><rect x="9.5" y="12" width="4.5" height="4.5" fill="${C.blue}"/><rect x="18" y="12" width="4.5" height="4.5" fill="${C.blue}"/><rect x="13.5" y="19.5" width="5" height="7.5" fill="${C.brown}"/>`,
};

export type IconName = keyof typeof ICONS;
ICONS.resumen = ICONS.informe;
ICONS.trofeo = ICONS.progreso;
ICONS.errores = ICONS.pieza;
ICONS.patrones = ICONS.puzzles;
ICONS.conversion = ICONS.corona;
ICONS.aperturas = ICONS.libro;
ICONS.brillantes = `<path d="M16 2.5l3.6 9.9 9.9 3.6-9.9 3.6L16 29.5l-3.6-9.9L2.5 16l9.9-3.6z" fill="${C.tealD}"/><path d="M16 1.5l3.6 9.9 9.9 3.6-9.9 3.6L16 28.5l-3.6-9.9L2.5 15l9.9-3.6z" fill="${C.teal}"/><circle cx="16" cy="15" r="3" fill="${C.cream}"/>`;
export const ico = (name: IconName | string): string => W(ICONS[name] || ICONS.mas, name);
