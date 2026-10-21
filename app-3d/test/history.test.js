// Testes do histórico (H3) com o motor em memória: npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const { criarHistorico, semearDemo } = require("../server/history");

function novo(valores = {}, opcoes = {}) {
  const estado = { values: valores, readAt: Date.now() };
  const h = criarHistorico({ demo: false, valores: () => estado.values, lidoEm: () => estado.readAt, ...opcoes });
  // imita o setValues do server.js
  const set = (patch) => {
    const mudou = {}, antes = {};
    for (const [k, v] of Object.entries(patch)) {
      if (estado.values[k] !== String(v)) { antes[k] = estado.values[k]; estado.values[k] = String(v); mudou[k] = String(v); }
    }
    if (Object.keys(mudou).length) h.registrar(mudou, antes);
  };
  return { h, set, estado };
}
const agora = () => ({ desde: Date.now() - 60000, ate: Date.now() + 1000 });

test("primeira leitura grava valores sem gerar eventos", async () => {
  const { h, set } = novo();
  set({ V0: 0, V3: 1, V7: "FECHADA", V11: 0 });
  const r = await h.leituras({ ...agora(), pinos: ["V0", "V7"] });
  assert.equal(r.motor, "memoria");
  assert.deepEqual(r.pinos.V0.map((x) => x[1]), [0]);
  assert.deepEqual(r.pinos.V7.map((x) => x[1]), ["FECHADA"]);
  assert.equal((await h.eventos(agora())).eventos.length, 0);
});

test("mudanças viram eventos com a origem certa", async () => {
  const { h, set } = novo();
  set({ V0: 0, V1: 0, V3: 1, V7: "FECHADA", V8: "DESARMADO", V9: 0, V11: 0 });
  set({ V11: 1, V0: 1 }); // PIR no automático acende a luz
  h.comando("V2"); // comando de janela pelo painel volta em V7
  set({ V3: 0 });
  set({ V7: "ABERTA" });
  h.comando("V9", "cena");
  set({ V9: 1, V8: "ARMADO" });
  set({ V8: "ALARME ATIVO" });
  set({ V1: 1 }); // sem comando: app do Blynk ou botão

  const evs = (await h.eventos(agora())).eventos.reverse().map((e) => `${e.tipo}:${e.detalhe}:${e.origem}`);
  assert.deepEqual(evs, [
    "presenca:detectada:sensor",
    "luz:ligada:automatico",
    "modo:manual:dispositivo",
    "janela:aberta:painel",
    "alarme:armado:cena",
    "alarme:disparado:sensor",
    "porta:destrancada:dispositivo",
  ]);
});

test("presença que termina e alarme rearmado não geram eventos extras", async () => {
  const { h, set } = novo();
  set({ V11: 0, V8: "ARMADO" });
  set({ V11: 1 });
  set({ V11: 0 });
  set({ V8: "ALARME ATIVO" });
  set({ V8: "ARMADO" });
  const evs = (await h.eventos(agora())).eventos.map((e) => `${e.tipo}:${e.detalhe}`);
  assert.deepEqual(evs.sort(), ["alarme:disparado", "presenca:detectada"]);
});

test("temperatura e umidade só entram pela amostra de 5 min, e só com leitura recente", async () => {
  const { h, set, estado } = novo();
  set({ V4: "24.0", V5: "58" });
  set({ V4: "24.1" });
  let r = await h.leituras({ ...agora(), pinos: ["V4", "V5"] });
  assert.equal(r.pinos.V4.length, 0);

  estado.readAt = Date.now() - 10 * 60000; // leitura velha (sem página e sem consulta de fundo)
  h.amostrar();
  r = await h.leituras({ ...agora(), pinos: ["V4"] });
  assert.equal(r.pinos.V4.length, 0);

  estado.readAt = Date.now();
  h.amostrar();
  h.amostrar(); // segunda chamada no mesmo intervalo não duplica
  r = await h.leituras({ ...agora(), pinos: ["V4", "V5"] });
  assert.deepEqual(r.pinos.V4.map((x) => x[1]), [24.1]);
  assert.deepEqual(r.pinos.V5.map((x) => x[1]), [58]);
});

test("antes traz o último valor anterior ao período (estado inicial dos gráficos)", async () => {
  const { h, set } = novo();
  set({ V0: 1 });
  await h.descarregar();
  const depois = Date.now() + 5;
  await new Promise((r) => setTimeout(r, 10));
  const r = await h.leituras({ desde: depois, ate: Date.now() + 1000, pinos: ["V0"] });
  assert.deepEqual(r.pinos.V0, []);
  assert.equal(r.antes.V0[1], 1);
});

test("eventos filtram por tipo, respeitam o limite e vêm do mais novo ao mais antigo", async () => {
  const { h } = novo();
  for (let i = 0; i < 5; i++) h.evento("luz", "painel", `n${i}`, Date.now() - (5 - i) * 1000);
  h.evento("porta", "painel", "destrancada");
  const r = await h.eventos({ ...agora(), tipos: ["luz"], limite: 3 });
  assert.deepEqual(r.eventos.map((e) => e.detalhe), ["n4", "n3", "n2"]);
});

test("mudanças no mesmo milissegundo ganham ts crescente (ordem certa no Postgres)", async () => {
  const { h, set } = novo();
  set({ V7: "FECHADA" });
  set({ V7: "ABERTA" });
  set({ V7: "FECHADA" });
  const ts = (await h.leituras({ ...agora(), pinos: ["V7"] })).pinos.V7.map((x) => x[0]);
  assert.equal(ts.length, 3);
  assert.ok(ts[0] < ts[1] && ts[1] < ts[2], JSON.stringify(ts));
});

test("aoEvento avisa cada evento novo (stream)", async () => {
  const { h, set } = novo({ V11: "0" });
  const vistos = [];
  h.aoEvento((e) => vistos.push(e.tipo));
  set({ V11: 1 });
  assert.deepEqual(vistos, ["presenca"]);
});

test("demonstração: 7 dias sintéticos coerentes", () => {
  const fim = Date.now();
  const { leituras, eventos } = semearDemo(fim);
  const temp = leituras.filter((l) => l.pino === "V4");
  assert.ok(temp.length >= 7 * 288 - 2, `amostras de temperatura: ${temp.length}`);
  for (const lista of [leituras, eventos]) {
    for (let i = 1; i < lista.length; i++) assert.ok(lista[i].ts >= lista[i - 1].ts, "fora de ordem");
    assert.ok(lista.every((x) => x.ts < fim && x.ts >= fim - 7 * 86400000 - 300000));
  }
  const tipos = new Set(eventos.map((e) => e.tipo));
  for (const t of ["presenca", "luz", "porta", "alarme", "modo"]) assert.ok(tipos.has(t), `sem eventos de ${t}`);
  const presencas = eventos.filter((e) => e.tipo === "presenca").length;
  assert.ok(presencas > 50 && presencas < 2000, `presenças: ${presencas}`);
  // mesma semente → mesmos dados
  assert.equal(semearDemo(fim).eventos.length, eventos.length);
});

test("demonstração começa com histórico e com o estado atual como última leitura", async () => {
  const estado = { values: { V0: "0", V3: "1", V4: "24.0", V7: "FECHADA" }, readAt: Date.now() };
  const h = criarHistorico({ demo: true, url: "postgres://ignorada", valores: () => estado.values, lidoEm: () => estado.readAt });
  assert.equal(h.motor, "memoria");
  await h.iniciar();
  const r = await h.leituras({ desde: Date.now() - 7 * 86400000, ate: Date.now() + 1000, pinos: ["V4", "V7"] });
  assert.ok(r.pinos.V4.length > 2000);
  assert.equal(r.pinos.V7.at(-1)[1], "FECHADA");
  await h.fechar();
});
