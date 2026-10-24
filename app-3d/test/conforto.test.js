// Testes do conforto adaptativo da janela (I6): npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const { aprender, decidir } = require("../server/conforto");

const M = 60000;
const temps = [
  [0, 25],
  [10 * M, 28],
  [20 * M, 28.5],
  [60 * M, 26],
];

test("sem ajustes manuais, valem os limites do firmware", () => {
  assert.deepEqual(aprender([], temps), { abrir: 30, fechar: 27, ajustes: [] });
});

test("abrir na mão com 28 °C puxa o limite para baixo (média móvel)", () => {
  const evs = [
    { ts: 12 * M, tipo: "janela", origem: "painel", detalhe: "aberta" },
    { ts: 22 * M, tipo: "janela", origem: "casa3d", detalhe: "aberta" },
  ];
  const r = aprender(evs, temps);
  // 30 → 30 + 0,35·(28 − 30) = 29,3 → 29,3 + 0,35·(28,5 − 29,3) = 29,02
  assert.equal(r.abrir, 29);
  assert.equal(r.ajustes.length, 2);
});

test("aberturas automáticas, de cena e do próprio conforto não contam", () => {
  const evs = ["automatico", "cena", "conforto"].map((origem) => ({
    ts: 12 * M,
    origem,
    detalhe: "aberta",
  }));
  assert.equal(aprender(evs, temps).ajustes.length, 0);
});

test("fechar fica pelo menos 1,5 °C abaixo de abrir", () => {
  const evs = [
    { ts: 21 * M, origem: "painel", detalhe: "fechada" },
    { ts: 21 * M + 1, origem: "painel", detalhe: "fechada" },
    { ts: 21 * M + 2, origem: "painel", detalhe: "fechada" },
  ];
  const r = aprender(evs, [[0, 29.9]]);
  assert.ok(r.fechar <= r.abrir - 1.5, `${r.fechar} × ${r.abrir}`);
});

test("decide abrir/fechar pelos limites e espera 10 min depois de uma mudança", () => {
  const base = { abrir: 28.5, fechar: 26, agora: 100 * M };
  assert.equal(decidir({ ...base, temp: 28.6, janela: "FECHADA" }), "abrir");
  assert.equal(decidir({ ...base, temp: 25.9, janela: "ABERTA" }), "fechar");
  assert.equal(decidir({ ...base, temp: 27, janela: "ABERTA" }), null);
  assert.equal(
    decidir({ ...base, temp: 29, janela: "FECHADA", ultimaMudanca: 95 * M }),
    null,
  );
});
