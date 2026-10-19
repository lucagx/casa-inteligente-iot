// Formatação única dos valores do Blynk — usada pelo painel, faixa compacta, hotspots e TV da sala,
// para que todos mostrem exatamente o mesmo número.

const num = (v) => (v === undefined || v === null || v === '' ? NaN : Number(v));

export const fmt = {
  // V4 → "24.3" (1 casa) ou "--"
  temp: (v) => { const n = num(v); return Number.isFinite(n) ? n.toFixed(1) : '--'; },
  // V5 → "58" (inteiro; o Blynk pode mandar "58.000") ou "--"
  umid: (v) => { const n = num(v); return Number.isFinite(n) ? String(Math.round(n)) : '--'; },
  // V11 → "Detectada" / "Livre" / "--"
  pres: (v) => (v === undefined || v === '' ? '--' : String(v) === '1' ? 'Detectada' : 'Livre'),
  // V7 → "Aberta" / "Fechada" / "--"
  janela: (v) => (v === 'ABERTA' ? 'Aberta' : v === 'FECHADA' ? 'Fechada' : '--'),
  // timestamp (ms) → "hh:mm:ss" ou "--:--:--"
  hora: (ts) => (Number.isFinite(ts) && ts > 0 ? new Date(ts).toLocaleTimeString('pt-BR') : '--:--:--'),
};
