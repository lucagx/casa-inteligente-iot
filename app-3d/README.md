# Casa Inteligente 3D — gêmeo digital do NodeMCU ESP8266

Maquete 3D em tempo real da Mini Casa Inteligente. O que acontece no protoboard
acontece na casa virtual, e o que você toca na casa virtual acontece no protoboard.

```
Protoboard (sensores/atuadores)
      │
  NodeMCU  ── Wi-Fi ──► Blynk Cloud ◄── HTTP ── server.js ── SSE (tempo real) ──► navegador / celular (3D)
                             ▲                                                      │
                             └──────────────── comandos (luz, porta, janela…) ◄────┘
```

## O que cada componente faz na casa 3D

| No protoboard | Pino | Pino virtual | Na casa 3D |
|---|---|---|---|
| LED (iluminação) | D1 | V0 | Luzes da sala, cozinha, quarto, spots do beiral, jardim e piscina |
| LED (trava da porta) | D0 | V1 | Porta abre/fecha e o LED da fechadura fica verde/vermelho |
| Servo SG90 | D7 | V2 (comando) / V7 (status) | Janela da parede leste gira 0° ↔ 90°, como o servo |
| DHT11 | D2 | V4 / V5 | Caixa azul na parede leste; temperatura e umidade no painel e na TV da sala |
| LDR | A0 | V6 / V10 | Céu muda de dia → entardecer → noite conforme a luz real |
| PIR HC-SR501 | D5 | V11 | Sensor ao lado da porta, cone de detecção e holograma de uma pessoa na entrada |
| HC-SR04 | D4 (TRIG) / D6 (ECHO) | V12 | Poste no fundo da garagem: o carro anda até a distância medida e a barra de LEDs fica verde/âmbar/vermelha |
| Buzzer | D8 | V8 / V9 | Sirene vermelha pisca e varre o jardim com luz |
| Botão | D3 | V9 | Arma/desarma o alarme (o estado aparece no painel) |
| NodeMCU | — | online/offline | LED azul pulsando na caixa ao lado da porta e anéis de Wi-Fi na antena |

Ligações e datastreams: veja `../firmware/README.md`.

## Rodando

1. Instale o [Node.js](https://nodejs.org) 18 ou mais novo.
2. Nesta pasta: `npm install`
3. `npm start`
4. Abra `http://localhost:3000`

Sem configurar nada, abre em **modo demonstração**: o painel mostra controles
deslizantes de temperatura/luz e um botão de presença, e o servidor aplica as mesmas
regras do firmware (incluindo a distância do carro na garagem). Serve de plano B se a placa ou o Wi-Fi falharem na apresentação.

### Ligando à placa de verdade

1. Grave o firmware pela tarefa **ESP8266: gravar pela USB** (`Ctrl+Shift+B`), com `secrets.h` preenchido.
2. No Blynk.Console, no template, garanta os datastreams **V0 a V12**
   (V6 *String*, V10 *Integer* 0–100, V12 *Integer* 0–200).
3. Copie `.env.example` para `.env` e preencha `BLYNK_TOKEN` e `BLYNK_SERVER`
   (a região do seu Blynk).
4. `npm start` — o selo no topo muda para **Blynk ao vivo** e **NodeMCU online**.

### Pelo celular

- **Mesma rede Wi-Fi:** ao iniciar, o servidor imprime o endereço (ex.: `http://192.168.0.23:3000`).
  Abra no navegador do celular. No celular a qualidade gráfica ajusta sozinha para "leve".
- **De qualquer lugar:** publique a pasta em um serviço como Render ou Railway e configure
  `BLYNK_TOKEN` e `BLYNK_SERVER` como variáveis de ambiente.

## Usando na apresentação

- **Câmeras** (barra inferior): Visão geral, Sala, Entrada, Janela, Garagem, Cobertura e Terreno.
- **Pontos brilhantes na casa** são clicáveis: luz, porta, janela e sirene alternam direto na cena.
  Passe o mouse para ver o nome do componente e a leitura.
- Clicar num atuador com o modo **Automático** ligado muda para **Manual** — igual ao firmware,
  que só aceita comandos manuais nesse modo.
- Roteiro rápido:
  1. Tampe o LDR com a mão → o céu escurece; passe a mão no PIR → a luz acende sozinha (IoB).
  2. Aqueça o DHT11 → a janela abre no protoboard e na casa ao mesmo tempo.
  3. Aproxime um carrinho (ou a mão) do HC-SR04 → o carro entra na garagem e a barra muda de cor.
  4. Arme o alarme (botão D3 ou painel) e passe a mão no PIR → holograma, sirene e buzzer.
  5. Troque para Manual e acenda a luz pelo celular → o LED do D1 acende.
- `?q=high` ou `?q=low` na URL força a qualidade gráfica.

## Observações

- O plano gratuito do Blynk tem limite de mensagens/requisições. O firmware só publica
  quando um valor muda e o servidor só consulta o Blynk enquanto a página está aberta.
- three.js e as fontes são servidos localmente: a parte visual funciona sem internet.
