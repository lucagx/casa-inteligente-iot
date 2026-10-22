// Testes do carregador do carro (V3): npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const { criarCarregador } = require("../server/carregador");

const H = 3600000;
// terça-feira, 20/10/2026 (hora local)
const as = (h) => new Date(2026, 9, 20, h, 0).getTime();

test("2 kW por 2 h numa bateria de 40 kWh sobe 10 %", () => {
  const c = criarCarregador({ kW: 2, bateriaKWh: 40, agora: as(10) });
  c.comando({ ligado: true }, as(10));
  const f = c.tick(as(12));
  assert.equal(f.carregando, true);
  assert.equal(f.bateria, 72);
});

test("só fora de ponta: espera até 22h e então carrega", () => {
  const c = criarCarregador({ agora: as(19) });
  let f = c.comando({ ligado: true, foraDePonta: true }, as(19));
  assert.equal(f.carregando, false);
  assert.equal(f.aguardando, true);
  f = c.tick(as(22));
  assert.equal(f.carregando, true);
  assert.equal(f.bateria, 62, "nada entrou enquanto esperava");
});

test("para sozinho em 100 % e não carrega com o carro fora", () => {
  const c = criarCarregador({ kW: 40, bateriaKWh: 40, agora: as(10) });
  c.comando({ ligado: true }, as(10));
  let f = c.tick(as(11));
  assert.equal(f.bateria, 100);
  assert.equal(f.carregando, false);
  f = c.sair(as(11));
  assert.equal(f.naGaragem, false);
  f = c.entrar(as(13)); // 2 h fora: 3 % + 2 % de gasto
  assert.equal(f.bateria, 95);
  assert.equal(f.carregando, true, "voltou abaixo de 100 % com o carregador ligado");
});

test("restaura do histórico (V24/V25/V26)", () => {
  const c = criarCarregador({ agora: as(10) });
  const f = c.restaurar({ V24: 1, V25: 48, V26: 1 }, as(10));
  assert.equal(f.bateria, 48);
  assert.equal(f.ligado, true);
  assert.equal(f.carregando, true);
  assert.deepEqual(c.pinos(), { V24: "1", V25: "48", V26: "1" });
});
