// Testes da ponte com os datastreams do servidor no Blynk (K1): npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const { criarPonte, saida, acao } = require("../server/blynk");

const espera = () => new Promise((r) => setImmediate(r));
const estado = (x = {}) => ({ scene: null, rooms: { sala: 0, cozinha: 0, quarto: 0, externa: 0 }, carro: { ligado: false, bateria: 62.7 }, ...x });

test("saida: cena pelo índice do menu, bateria inteira, externa em %", () => {
  assert.deepEqual(saida(estado({ scene: { id: "sai" }, rooms: { externa: 60 } })), { V16: "2", V18: "0", V25: "62", V23: "60" });
  assert.equal(saida(estado()).V16, "0");
});

test("acao: valores do Blynk viram ações; inválidos são ignorados", () => {
  assert.deepEqual(acao("V16", "3"), { tipo: "cena", id: "dormir" });
  assert.equal(acao("V16", "0"), null);
  assert.deepEqual(acao("V18", "1"), { tipo: "carregador", ligado: true });
  assert.deepEqual(acao("V23", "150"), { tipo: "externa", nivel: 100 });
  assert.equal(acao("V25", "50"), null, "bateria é só leitura");
  assert.equal(acao("V23", "abc"), null);
});

test("publicar manda só o que mudou", async () => {
  const enviados = [];
  const p = criarPonte({ enviar: async (pino, v) => enviados.push(`${pino}=${v}`), executar: async () => {} });
  p.publicar(estado());
  await espera();
  assert.deepEqual(enviados.sort(), ["V16=0", "V18=0", "V23=0", "V25=62"]);
  enviados.length = 0;
  p.publicar(estado({ carro: { ligado: true, bateria: 62.9 } }));
  await espera();
  assert.deepEqual(enviados, ["V18=1"]);
});

test("entrada: mudança no app vira ação; o próprio envio voltando e a 1ª leitura não", async () => {
  const feitas = [];
  const p = criarPonte({ enviar: async () => {}, executar: async (a) => feitas.push(a) });
  p.entrada({ V18: "0", V23: "0", V16: "0" }); // 1ª leitura: só registra
  p.publicar(estado({ rooms: { externa: 60 } }));
  await espera();
  p.entrada({ V23: "0" }); // leitura atrasada, de antes do envio: não desfaz
  p.entrada({ V23: "60" }); // nosso envio voltando
  assert.equal(feitas.length, 0);
  p.entrada({ V23: "30", V16: "1" }); // alguém mexeu no app do Blynk
  await espera();
  assert.deepEqual(feitas, [{ tipo: "cena", id: "cheguei" }, { tipo: "externa", nivel: 30 }]);
});

test("pino sem datastream: avisa uma vez e espera antes de tentar de novo", async () => {
  let t = 0, tentativas = 0;
  const avisos = [];
  const p = criarPonte({
    enviar: async (pino) => { if (pino === "V25") { tentativas++; throw new Error("Blynk 400"); } },
    executar: async () => {}, avisar: (x) => avisos.push(x), agora: () => t,
  });
  p.publicar(estado()); await espera();
  p.publicar(estado()); await espera();
  assert.equal(tentativas, 1);
  t = 11 * 60000;
  p.publicar(estado()); await espera();
  assert.equal(tentativas, 2);
  assert.equal(avisos.length, 1);
});
