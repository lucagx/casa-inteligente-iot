// Testes do consumo (I3): npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const { calcular, faixa, lerPares, POTENCIA_PADRAO } = require("../server/consumo");

const H = 3600000;
const perto = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-3, `${msg}: ${a} ≠ ${b}`);
// terça-feira, 20/10/2026 às 00:00 (hora local)
const T0 = new Date(2026, 9, 20, 0, 0).getTime();
const semBase = { ...POTENCIA_PADRAO, base: 0 };

test("sala a 100 % por 1 h = 60 Wh", () => {
  const r = calcular({ desde: T0, ate: T0 + 2 * H, pinos: { V20: [[T0, 100], [T0 + H, 0]] }, antes: {} },
    { potencias: semBase, agora: T0 + 2 * H });
  perto(r.dias[0].porComodo.sala, 0.06, "sala");
  perto(r.dias[0].kWh, 0.06, "total");
});

test("sem registro dos cômodos, V0 ligado acende todos (regra da luz geral)", () => {
  const r = calcular({ desde: T0, ate: T0 + 2 * H, pinos: { V0: [[T0, 1], [T0 + H, 0]] }, antes: {} },
    { potencias: semBase, agora: T0 + 2 * H });
  perto(r.dias[0].kWh, (60 + 50 + 30 + 80) / 1000, "4 cômodos por 1 h");
});

test("nível parcial: quarto a 15 % por 2 h", () => {
  const r = calcular({ desde: T0, ate: T0 + 3 * H, pinos: { V22: [[T0, 15], [T0 + 2 * H, 0]] }, antes: {} },
    { potencias: semBase, agora: T0 + 3 * H });
  perto(r.dias[0].porComodo.quarto, (30 * 0.15 * 2) / 1000, "quarto");
});

test("base sempre ligada e preço pela tarifa", () => {
  const r = calcular({ desde: T0, ate: T0 + 24 * H, pinos: {}, antes: {} }, { potencias: { ...semBase, base: 2 }, tarifa: 1, agora: T0 + 24 * H - 1 });
  perto(r.hoje.kWh, 0.048, "2 W × 24 h");
  perto(r.hoje.reais, 0.048, "R$ 1/kWh");
});

test("faixas da tarifa branca: ponta só em dia útil, 18h–21h", () => {
  assert.equal(faixa(new Date(2026, 9, 20, 19, 0).getTime()), "ponta");          // terça 19h
  assert.equal(faixa(new Date(2026, 9, 20, 17, 30).getTime()), "intermediaria"); // terça 17h30
  assert.equal(faixa(new Date(2026, 9, 20, 23, 0).getTime()), "fora");
  assert.equal(faixa(new Date(2026, 9, 24, 19, 0).getTime()), "fora");           // sábado 19h
});

test("uso na ponta fica mais caro na tarifa branca", () => {
  const p = new Date(2026, 9, 20, 18, 0).getTime();
  const r = calcular({ desde: T0, ate: T0 + 24 * H, pinos: { V23: [[p, 100], [p + 3 * H, 0]] }, antes: {} },
    { potencias: semBase, tarifa: 1, agora: T0 + 24 * H });
  perto(r.branca.pctPonta, 100, "tudo na ponta");
  assert.ok(r.branca.branca > r.branca.convencional, "branca > convencional");
});

test("CONSUMO_W do .env sobrepõe só o que foi informado", () => {
  assert.deepEqual(lerPares("sala=100, base=3, xx=9, quarto=-1", POTENCIA_PADRAO), { ...POTENCIA_PADRAO, sala: 100, base: 3 });
});

test("carregador do carro (V24): potência cheia enquanto carrega, por faixa", () => {
  const p = new Date(2026, 9, 20, 18, 0).getTime(); // terça 18h: ponta
  const r = calcular({ desde: T0, ate: T0 + 24 * H, pinos: { V24: [[p, 1], [p + 2 * H, 0]] }, antes: {} },
    { potencias: { ...semBase, carregador: 2000 }, tarifa: 1, agora: T0 + 24 * H });
  perto(r.dias[0].porComodo.carregador, 4, "2 kW × 2 h");
  perto(r.dias[0].carro.ponta, 4, "tudo na ponta");
  assert.match(r.dica, /Só fora de ponta/);
});

test("carregador ligado antes do período (antes.V24) conta desde o início", () => {
  const r = calcular({ desde: T0, ate: T0 + H, pinos: {}, antes: { V24: [T0 - H, 1] } },
    { potencias: { ...semBase, carregador: 1000 }, agora: T0 + H });
  perto(r.dias[0].porComodo.carregador, 1, "1 kW × 1 h");
});
