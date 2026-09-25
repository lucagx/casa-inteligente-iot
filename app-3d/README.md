# Casa Inteligente 3D — gêmeo digital do ESP32-S3

Maquete 3D em tempo real da Mini Casa Inteligente. O que acontece no protoboard
acontece na casa virtual, e o que você toca na casa virtual acontece no protoboard.

```
Protoboard (sensores/atuadores)
      │
  ESP32-S3 ── Wi-Fi ──► Blynk Cloud ◄── HTTP ── server.js ── SSE (tempo real) ──► navegador / celular (3D)
                             ▲                                                      │
                             └──────────────── comandos (luz, porta, janela…) ◄────┘
```

## O que cada componente faz na casa 3D

| No protoboard | Pino | Pino virtual | Na casa 3D |
|---|---|---|---|
| LED (iluminação) | GPIO 15 | V0 | Luzes da sala, cozinha, quarto, spots do beiral, jardim e piscina |
| LED (trava da porta) | GPIO 16 | V1 | Porta abre/fecha e o LED da fechadura fica verde/vermelho |
| Servo SG90 | GPIO 7 | V2 (comando) / V7 (status) | Janela lateral gira 0° ↔ 90°, como o servo |
| DHT22 | GPIO 4 | V4 / V5 | Temperatura e umidade no painel e na TV da sala |
| LDR | GPIO 1 | V6 / V10 | Céu muda de dia → entardecer → noite conforme a luz real |
| HC-SR04 | GPIO 5 / 6 | V11 | Holograma de uma pessoa aparece na entrada |
| Buzzer | GPIO 17 | V8 / V9 | Sirene vermelha pisca e varre o jardim com luz |
| ESP32-S3 | — | online/offline | LED azul pulsando na caixa ao lado da porta e anéis de Wi-Fi na antena |

## Rodando

1. Instale o [Node.js](https://nodejs.org) 18 ou mais novo.
2. Nesta pasta: `npm install`
3. `npm start`
4. Abra `http://localhost:3000`

Sem configurar nada, abre em **modo demonstração**: o painel mostra controles
deslizantes de temperatura/luz e um botão de presença, e o servidor aplica as mesmas
regras do firmware. Serve de plano B se a placa ou o Wi-Fi falharem na apresentação.

### Ligando ao ESP32 de verdade

1. Grave `firmware/casa_inteligente_esp32s3.ino` no ESP32-S3 (troque token, rede e senha).
2. No Blynk.Console, no template, garanta os datastreams **V0 a V11**
   (V10 e V11 são novos: *Integer*, 0–100 e 0–1).
3. Copie `.env.example` para `.env` e preencha `BLYNK_TOKEN` e `BLYNK_SERVER`
   (a região do seu Blynk).
4. `npm start` — o selo no topo muda para **Blynk ao vivo** e **ESP32-S3 online**.

### Pelo celular

- **Mesma rede Wi-Fi:** ao iniciar, o servidor imprime o endereço (ex.: `http://192.168.0.23:3000`).
  Abra no navegador do celular. No celular a qualidade gráfica ajusta sozinha para "leve".
- **De qualquer lugar:** publique a pasta em um serviço como Render ou Railway e configure
  `BLYNK_TOKEN` e `BLYNK_SERVER` como variáveis de ambiente.

## Usando na apresentação

- **Câmeras** (barra inferior): Visão geral, Sala, Entrada, Janela, Cobertura e Terreno.
- **Pontos brilhantes na casa** são clicáveis: luz, porta, janela e sirene alternam direto na cena.
  Passe o mouse para ver o nome do componente e a leitura.
- Clicar num atuador com o modo **Automático** ligado muda para **Manual** — igual ao firmware,
  que só aceita comandos manuais nesse modo.
- Roteiro rápido:
  1. Tampe o LDR com a mão → o céu escurece e as luzes acendem sozinhas (IoB).
  2. Aqueça o DHT22 → a janela abre no protoboard e na casa ao mesmo tempo.
  3. Arme o alarme e aproxime a mão do HC-SR04 → holograma na entrada, sirene e buzzer.
  4. Troque para Manual e acenda a luz pelo celular → o LED do GPIO 15 acende.
- `?q=high` ou `?q=low` na URL força a qualidade gráfica.

## Observações

- O plano gratuito do Blynk tem limite de mensagens/requisições. O firmware só publica
  quando um valor muda e o servidor só consulta o Blynk enquanto a página está aberta.
- three.js e as fontes são servidos localmente: a parte visual funciona sem internet.
