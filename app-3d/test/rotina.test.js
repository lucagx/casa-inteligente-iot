// Testes da rotina aprendida e do modo ausente (I5): npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  aprender,
  padraoLuzes,
  sugerir,
  devidas,
  alvoAusente,
  intervalosAusente,
  hhmm,
} = require("../server/rotina");

const H = 3600000,
  DIA = 86400000;
// quarta-feira, 21/10/2026 às 20:00 (hora local)
const AGORA = new Date(2026, 9, 21, 20, 0).getTime();
const as = (diasAtras, h, m = 0) => {
  const d = new Date(AGORA - diasAtras * DIA);
  d.setHours(h, m, 0, 0);
  return d.getTime();
};

test("saída e chegada pelo carro, mediana dos dias úteis", () => {
  const carro = [];
  for (const [d, s, c] of [
    [1, [7, 30], [18, 20]],
    [2, [7, 40], [18, 40]],
    [5, [7, 20], [18, 30]],
  ]) {
    carro.push(
      { ts: as(d, ...s), detalhe: "saiu" },
      { ts: as(d, ...c), detalhe: "chegou" },
    );
  }
  const r = aprender({ presencas: [], carro, agora: AGORA });
  assert.equal(hhmm(r.uteis.saida), "07:30");
  assert.equal(hhmm(r.uteis.chegada), "18:30");
  assert.equal(r.uteis.amostras, 3);
});

test("sem carro: maior intervalo sem presença (≥ 3 h) vira saída/chegada", () => {
  const presencas = [as(1, 6, 40), as(1, 7, 10), as(1, 17, 50), as(1, 19, 0)];
  const r = aprender({ presencas, carro: [], agora: AGORA });
  const terca = r.porDia.find((d) => d.dia === 2);
  assert.equal(hhmm(terca.saida), "07:10");
  assert.equal(hhmm(terca.chegada), "17:50");
});

test("padrão das luzes por hora ignora o tempo em modo ausente e o período sem dados", () => {
  const ini = as(2, 0);
  const pinos = {
    V20: [
      [ini, 0],
      [as(2, 19), 100],
      [as(2, 21), 0],
      [as(1, 19), 100],
      [as(1, 21), 0],
    ],
  };
  const fora = intervalosAusente(
    [
      { ts: as(1, 18), detalhe: "ligado" },
      { ts: as(1, 22), detalhe: "desligado" },
    ],
    AGORA,
  );
  const p = padraoLuzes(
    { desde: AGORA - 14 * DIA, ate: as(0, 0), pinos, antes: {} },
    fora,
  );
  assert.equal(p.sala[19], 1, "19h: só o dia fora do modo ausente conta");
  assert.equal(p.sala[3], 0);
  const alvo = alvoAusente(p, as(0, 20, 30));
  assert.equal(alvo.sala, 100);
  assert.equal(alvo.quarto, 0);
});

test("sugestões: automações com 2+ dias e ações com a casa vazia; dispensadas somem", () => {
  const rotina = { uteis: { saida: 450, chegada: 1110, amostras: 3 } };
  let s = sugerir(rotina, {
    agora: AGORA,
    alarmeArmado: false,
    presenceAt: AGORA - 3 * H,
    ausente: false,
  });
  assert.deepEqual(
    s.map((x) => x.id),
    ["luz-chegada", "alarme-saida", "armar-agora", "ausente-agora"],
  );
  assert.equal(s[0].automacao.hora, "18:20");
  s = sugerir(rotina, {
    agora: AGORA,
    alarmeArmado: true,
    presenceAt: AGORA - 10 * 60000,
    ausente: false,
    dispensadas: { "luz-chegada": AGORA + H },
  });
  assert.deepEqual(
    s.map((x) => x.id),
    ["alarme-saida"],
  );
});

test("automação dispara uma vez por dia, só nos dias e na janela de 30 min", () => {
  const a = [{ id: "luz-chegada", hora: "19:50", dias: [3] }];
  const feitas = new Set();
  const d = devidas(a, AGORA, feitas);
  assert.equal(d.length, 1);
  feitas.add(d[0].chave);
  assert.equal(devidas(a, AGORA + 60000, feitas).length, 0);
  assert.equal(
    devidas(a, AGORA + 40 * 60000, new Set()).length,
    0,
    "passou da janela",
  );
  assert.equal(
    devidas([{ ...a[0], dias: [1] }], AGORA, new Set()).length,
    0,
    "não é segunda",
  );
});
