// Testes dos insights diários e alertas (I7): npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const { insights, tempoLigado, avaliar } = require("../server/insights");

const H = 3600000,
  MIN = 60000,
  DIA = 86400000;
const D0 = new Date(2026, 9, 20, 0, 0).getTime(); // terça, 20/10/2026

test("tempo de luz ligada respeita o estado anterior ao período", () => {
  assert.equal(
    tempoLigado(
      [
        [D0 + H, 0],
        [D0 + 2 * H, 1],
        [D0 + 3 * H, 0],
      ],
      [D0 - H, 1],
      D0,
      D0 + DIA,
    ),
    2 * H,
  );
});

test("insights: detecções, pico, janela e comparação com a média", () => {
  const ev = (ts, tipo, detalhe, origem = "sensor") => ({
    ts,
    tipo,
    detalhe,
    origem,
  });
  const eventos = [];
  for (let d = 1; d <= 7; d++)
    for (let i = 0; i < 10; i++)
      eventos.push(
        ev(D0 - d * DIA + 20 * H + i * MIN, "presenca", "detectada"),
      );
  for (let i = 0; i < 20; i++)
    eventos.push(ev(D0 + 21 * H + i * MIN, "presenca", "detectada"));
  eventos.push(
    ev(D0 + 13 * H, "janela", "aberta", "automatico"),
    ev(D0 + 15 * H, "janela", "aberta", "painel"),
  );
  const r = insights({
    eventos,
    v0: { pts: [], antes: null },
    dia: D0,
    agora: D0 + DIA + H,
  });
  assert.equal(r.deteccoes, 20);
  assert.deepEqual(r.pico, { hora: 21, n: 20 });
  assert.equal(r.media.deteccoes, 10);
  assert.match(r.frases[0], /100% mais movimento/);
  assert.ok(
    r.frases.some((f) =>
      /abriu 2× \(1 pela regra do calor, 1 na mão\)/.test(f),
    ),
  );
});

test("alertas: porta só depois de 10 min; calor só no manual; invasão até desarmar", () => {
  const memo = {};
  const s = (values, extra = {}) => ({
    mode: "demo",
    deviceOnline: true,
    values,
    ...extra,
  });
  assert.equal(avaliar(s({ V1: "1" }), memo, 0).length, 0);
  assert.deepEqual(
    avaliar(s({ V1: "1" }), memo, 11 * MIN).map((a) => a.id),
    ["porta"],
  );
  assert.equal(
    avaliar(s({ V1: "0", V4: "31", V7: "FECHADA", V3: "1" }), memo, 12 * MIN)
      .length,
    0,
    "no automático o firmware abre",
  );
  avaliar(s({ V4: "31", V7: "FECHADA", V3: "0" }), memo, 13 * MIN);
  assert.deepEqual(
    avaliar(s({ V4: "31", V7: "FECHADA", V3: "0" }), memo, 16 * MIN).map(
      (a) => a.id,
    ),
    ["calor"],
  );
  avaliar(s({ V8: "ALARME ATIVO", V9: "1" }), memo, 20 * MIN);
  assert.deepEqual(
    avaliar(s({ V8: "ARMADO", V9: "1" }), memo, 21 * MIN).map((a) => a.id),
    ["invasao"],
    "continua depois dos 4 s do buzzer",
  );
  assert.equal(
    avaliar(s({ V8: "DESARMADO", V9: "0" }), memo, 22 * MIN).length,
    0,
  );
});

test("alerta de bateria baixa do carro na garagem", () => {
  const r = avaliar(
    {
      values: {},
      carro: {
        naGaragem: true,
        bateria: 12.4,
        carregando: false,
        aguardando: false,
      },
    },
    {},
    0,
  );
  assert.equal(r[0].id, "bateria");
  assert.equal(r[0].titulo, "Carro com 12% de bateria");
});
