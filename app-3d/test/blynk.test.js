// Testes da ponte com o Blynk: datastreams do servidor (K1) e eventos (K3): npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const { criarPonte, criarEventos, saida, acao } = require("../server/blynk");

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

test("eventos (K3): alerta da I7 vira evento do Blynk; offline fica com o embutido; sem repetir em 15 min", async () => {
  let t = new Date(2026, 9, 22, 10, 0).getTime();
  const enviados = [];
  const ev = criarEventos({ enviar: async (c, d) => enviados.push([c, d]), agora: () => t });
  assert.equal(ev.alerta({ id: "porta", titulo: "Porta destrancada", texto: "Há 12 min." }), true);
  assert.equal(ev.alerta({ id: "offline", titulo: "NodeMCU offline", texto: "" }), false);
  assert.equal(ev.alerta({ id: "invasao", titulo: "x", texto: "y" }), false, "a invasão sai da placa");
  assert.equal(ev.alerta({ id: "porta", titulo: "x", texto: "y" }), false, "repetido");
  t += 16 * 60000;
  assert.equal(ev.alerta({ id: "porta", titulo: "x", texto: "y" }), true);
  assert.equal(ev.resumo("a".repeat(400)), true);
  await espera();
  assert.deepEqual(enviados[0], ["porta_aberta", "Porta destrancada. Há 12 min."]);
  assert.equal(enviados[2][0], "resumo_diario");
  assert.ok(enviados[2][1].length <= 250);
});

test("eventos (K3): para no limite do dia e volta no dia seguinte", () => {
  let t = new Date(2026, 9, 22, 0, 1).getTime();
  const ev = criarEventos({ enviar: async () => {}, agora: () => t });
  let n = 0;
  for (let i = 0; i < 200; i++) { t += 16 * 60000 / 3; if (ev.alerta({ id: ["porta", "calor", "bateria"][i % 3], titulo: "", texto: "" })) n++; }
  assert.equal(n, 90, "para no limite do dia");
  t = new Date(2026, 9, 24, 8, 0).getTime();
  assert.equal(ev.alerta({ id: "porta", titulo: "", texto: "" }), true);
});

test("terminal (F3): linha com hora, evento, detalhe e origem; presença no máx. 1 por minuto", async () => {
  const { criarTerminal, linhaTerminal } = require("../server/blynk");
  const ts = new Date(2026, 9, 22, 20, 14).getTime();
  assert.equal(linhaTerminal({ ts, tipo: "luz", origem: "painel", detalhe: "ligada" }), "20:14 luz ligada (painel)");
  assert.equal(linhaTerminal({ ts, tipo: "janela", origem: "dispositivo", detalhe: "aberta" }), "20:14 janela aberta (app/botão)");
  const linhas = [];
  const t = criarTerminal({ enviar: async (x) => linhas.push(x) });
  t.evento({ ts, tipo: "presenca", origem: "sensor", detalhe: "detectada" });
  t.evento({ ts: ts + 20000, tipo: "presenca", origem: "sensor", detalhe: "detectada" });
  t.evento({ ts: ts + 30000, tipo: "luz", origem: "painel", detalhe: "ligada" });
  await espera(); await espera();
  assert.deepEqual(linhas, ["20:14 presenca detectada (sensor)", "20:14 luz ligada (painel)"]);
});

test("terminal (F3): sem datastream avisa uma vez e não insiste", async () => {
  const { criarTerminal } = require("../server/blynk");
  let tentativas = 0, tt = 0;
  const avisos = [];
  const t = criarTerminal({ enviar: async () => { tentativas++; throw new Error("Blynk 400"); }, avisar: (x) => avisos.push(x), agora: () => tt });
  const e = (n) => ({ ts: 1000 + n, tipo: "luz", origem: "painel", detalhe: "ligada" });
  t.evento(e(1)); await espera(); await espera();
  t.evento(e(2)); await espera(); await espera();
  assert.equal(tentativas, 1);
  assert.equal(avisos.length, 1);
});

test("terminal (F3): o que a placa já escreve (alarme, regra automática) não é repetido pelo servidor", async () => {
  const { criarTerminal } = require("../server/blynk");
  const linhas = [];
  const t = criarTerminal({ enviar: async (x) => linhas.push(x) });
  const ts = new Date(2026, 9, 22, 20, 14).getTime();
  t.evento({ ts, tipo: "alarme", origem: "dispositivo", detalhe: "armado" });
  t.evento({ ts, tipo: "alarme", origem: "sensor", detalhe: "disparado" });
  t.evento({ ts, tipo: "luz", origem: "automatico", detalhe: "ligada" });
  t.evento({ ts, tipo: "janela", origem: "automatico", detalhe: "aberta" });
  t.evento({ ts, tipo: "luz", origem: "painel", detalhe: "ligada" });
  await espera(); await espera();
  assert.deepEqual(linhas, ["20:14 luz ligada (painel)"]);
});
