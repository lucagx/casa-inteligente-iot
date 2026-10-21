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
  // V8/V9 → "Disparado" / "Armado" / "Desarmado"
  alarme: (v8, v9) => (/ATIVO/i.test(v8 || '') ? 'Disparado' : String(v9) === '1' ? 'Armado' : 'Desarmado'),
  // B5: quanto tempo desde ts (ms) → "agora", "há 12 s", "há 5 min", "às 14:03" (hoje) ou "em 19/10 14:03"
  ha: (ts, agora = Date.now()) => {
    if (!Number.isFinite(ts) || ts <= 0) return '';
    const s = Math.max(0, Math.round((agora - ts) / 1000));
    if (s < 2) return 'agora';
    if (s < 60) return `há ${s} s`;
    if (s < 3600) return `há ${Math.floor(s / 60)} min`;
    const d = new Date(ts), hm = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return d.toDateString() === new Date(agora).toDateString() ? `às ${hm}` : `em ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hm}`;
  },
  // B5: linha de apoio da presença → "3 detecções hoje · última há 12 s"
  presInfo: (v14, presenceAt, agora) => {
    const n = v14 === undefined || v14 === '' ? NaN : Number(v14);
    const partes = [];
    if (Number.isFinite(n)) partes.push(`${n} ${n === 1 ? 'detecção' : 'detecções'} hoje`);
    const h = fmt.ha(presenceAt, agora);
    if (h) partes.push(`última ${h}`);
    return partes.join(' · ');
  },
  // timestamp (ms) → "hh:mm:ss" ou "--:--:--"
  hora: (ts) => (Number.isFinite(ts) && ts > 0 ? new Date(ts).toLocaleTimeString('pt-BR') : '--:--:--'),
};
