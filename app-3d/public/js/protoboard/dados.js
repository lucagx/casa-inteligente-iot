// Catálogo das peças da montagem atual (firmware 1.3.0, LDR e HC-SR04 desligados por flag e fora do protoboard).
// Fonte única dos textos: rótulos, cartão de detalhe e cores por sistema.

export const SISTEMAS = {
  sensor: { nome: "Sensor", cor: "#ffc27a" },
  atuador: { nome: "Atuador", cor: "#ff6b81" },
  nuvem: { nome: "Nuvem", cor: "#6aa8ff" },
  iob: { nome: "IoB", cor: "#36e39a" },
};

// rotulo: { x, y, z } = deslocamento do rótulo em relação ao topo da peça (unidades = passo de 2,54 mm);
// abaixo: true pendura o rótulo abaixo do ponto (fileira da frente, sobre o tampo)
export const PECAS = [
  {
    id: "esp8266",
    nome: "NodeMCU ESP8266",
    curto: "Wi-Fi · Blynk",
    sistema: "nuvem",
    pino: "Vin → trilho 5 V · 3V3 → trilho 3,3 V · GND comum",
    datastream: "V3 modo automático · V13 terminal · V14 detecções do dia",
    casa: "Cérebro da casa: lê os sensores, aplica as regras do modo automático e conversa com o Blynk Cloud, que leva tudo para a casa 3D e o painel do celular.",
    rotulo: { x: -3, y: 8, z: 0 },
  },
  {
    id: "dht11",
    nome: "DHT11",
    curto: "D2 · V4/V5",
    sistema: "sensor",
    pino: "D2 (GPIO4) · alimentado em 3,3 V",
    datastream: "V4 temperatura · V5 umidade",
    casa: "Mede a temperatura e a umidade da sala. No automático, a janela abre com ≥ 30 °C e fecha com ≤ 27 °C.",
    iob: "Conforto: aprende os limites da janela pelos seus ajustes manuais.",
    rotulo: { x: 0, y: -7.6, z: -20.5, abaixo: true },
  },
  {
    id: "pir",
    nome: "PIR HC-SR501",
    curto: "D5 · V11",
    sistema: "sensor",
    pino: "D5 (GPIO14) · alimentado em 5 V",
    datastream: "V11 presença · V14 detecções do dia",
    casa: "Detecta movimento na entrada. No automático acende a luz; com o alarme armado, dispara o buzzer. Segura a presença por 8 s.",
    iob: "Rotina: aprende os horários de saída e chegada e sugere o modo ausente.",
    rotulo: { x: 0, y: 5, z: 0 },
  },
  {
    id: "led-luz",
    nome: "LED da luz",
    curto: "D1 · V0",
    sistema: "atuador",
    pino: "D1 (GPIO5) · resistor de 220 Ω",
    datastream: "V0 luz geral",
    casa: "Luz geral da casa: acende quando algum cômodo está aceso e segue a presença no modo automático.",
    iob: "Consumo: o tempo aceso vira kWh e custo no painel.",
    rotulo: { x: 0, y: 8, z: 4 },
  },
  {
    id: "led-porta",
    nome: "LED da porta",
    curto: "D0 · V1",
    sistema: "atuador",
    pino: "D0 (GPIO16) · resistor de 220 Ω",
    datastream: "V1 porta",
    casa: "Trava da porta de entrada: aceso = destrancada, apagado = trancada.",
    rotulo: { x: 2, y: -4.5, z: -18.5, abaixo: true },
  },
  {
    id: "servo",
    nome: "Servo SG90",
    curto: "D7 · V2/V7",
    sistema: "atuador",
    pino: "D7 (GPIO13) · alimentado em 5 V",
    datastream: "V2 comando · V7 status (ABERTA/FECHADA)",
    casa: "Abre e fecha as janelas: pelo app no modo manual ou pela temperatura no automático.",
    rotulo: { x: 0, y: -8, z: -16, abaixo: true },
  },
  {
    id: "buzzer",
    nome: "Buzzer",
    curto: "D8 · V8",
    sistema: "atuador",
    pino: "D8 (GPIO15)",
    datastream: "V8 status do alarme",
    casa: "Sirene do alarme: toca 4 s quando o alarme armado percebe presença; a placa manda o alerta de invasão para o celular.",
    rotulo: { x: 0, y: 7, z: 3 },
  },
  {
    id: "botao",
    nome: "Botão do alarme",
    curto: "D6 · V9",
    sistema: "sensor",
    pino: "D6 (GPIO12) · pull-up interno, fecha no GND",
    datastream: "V9 alarme armado",
    casa: "Arma e desarma o alarme direto na placa. O app e as automações do Blynk mudam o mesmo V9.",
    iob: "Rotina: pode armar sozinho nos dias úteis quando a casa fica vazia.",
    rotulo: { x: -2, y: -2, z: -16, abaixo: true },
  },
];

export const IDS = PECAS.map((p) => p.id);
// ordem do tour e das setas: o cérebro, os sensores e depois os atuadores
export const ORDEM = ["esp8266", "dht11", "pir", "botao", "led-luz", "led-porta", "servo", "buzzer"];
export const peca = (id) => PECAS.find((p) => p.id === id) || null;
