# Firmware — NodeMCU ESP8266

`casa_inteligente/casa_inteligente.ino` é o firmware em uso (versão **1.2.0**). Credenciais ficam em
`casa_inteligente/secrets.h` (fora do git); o modelo é `secrets.example.h`.

## Gravar

Tarefas do VS Code (`Ctrl+Shift+P` → *Tasks: Run Task*):

| Tarefa | Quando usar |
|---|---|
| **ESP8266: instalar ferramentas** | Uma vez em cada PC (arduino-cli, core ESP8266, bibliotecas) |
| **ESP8266: gravar pela USB** (`Ctrl+Shift+B`) | Placa no cabo. Detecta a porta COM sozinho |
| **ESP8266: gravar pelo Wi-Fi (mesma rede)** | ArduinoOTA: PC e placa na mesma rede (ex.: em casa) |
| **ESP8266: gerar .bin para o Blynk.Air** | Placa em outra rede (ex.: Wi-Fi do celular na faculdade) |
| **ESP8266: monitor serial** | Ver os logs da placa (115200) |

A primeira gravação com OTA precisa ser pela USB. Depois disso, as próximas podem ir pelo Wi-Fi.
A cada envio pelo Blynk.Air, suba `BLYNK_FIRMWARE_VERSION` no topo do `.ino`.

## Sensores opcionais (LDR e HC-SR04)

O LDR e o HC-SR04 saíram do protoboard: a montagem ficou instável e interferia na presença.
O código continua no firmware, desligado por duas flags no topo do `.ino`:

```cpp
#define USAR_LDR     0   // 1 = lê o A0 e publica V6/V10; a luz automática volta a exigir escuro
#define USAR_HCSR04  0   // 1 = TRIG D4 / ECHO D6 e publica V12; o botão volta para o D3
```

Com as duas em `0` (montagem atual) a placa não lê nem publica V6/V10/V12, não configura os pinos
desses sensores e, no modo automático, **a luz segue só a presença**. Para reativar, troque para `1`,
religue as peças como em [Ligações dos sensores opcionais](#ligações-dos-sensores-opcionais) e grave de novo.

## Pinagem (montagem atual)

| Componente | Pino NodeMCU | Blynk |
|---|---|---|
| LED luz | D1 | V0 |
| LED porta (trava) | D0 | V1 |
| Servo SG90 (janela) | D7 | V2 comando · V7 status |
| DHT11 | D2 | V4 temperatura · V5 umidade |
| PIR HC-SR501 | D5 | V11 presença · V14 detecções hoje |
| Buzzer | D8 | V8 status do alarme |
| Botão (arma/desarma) | **D6** (botão externo para o GND) | V9 alarme armado |
| — | — | V3 modo automático |

## Presença estável (PIR HC-SR501)

**No firmware**

- A presença liga na hora em que o PIR sobe e publica o V11 imediatamente.
- Ela só desliga depois de `PRESENCA_RETENCAO_MS` (8 s) sem sinal, então não pisca enquanto a pessoa está parada.
- As leituras dos primeiros `PIR_AQUECIMENTO_MS` (60 s) depois de ligar são ignoradas, porque o sensor ainda está aquecendo.
- Cada nova detecção soma 1 no **V14** (detecções hoje).
- O contador zera à meia-noite, pelo horário de Brasília, com a hora do relógio do Blynk.

**Ajuste do sensor** (com a placa desligada):

1. Jumper de disparo em **H** (redisparo/repetível). Em **L** ele desliga sozinho mesmo com movimento.
2. Trimpot de **tempo** no mínimo, girando todo no sentido anti-horário. Quem segura a presença agora é o firmware.
3. Trimpot de **sensibilidade** no meio. Se houver falsos disparos, gire um pouco para o anti-horário.
4. Alimente pelo **VIN (5 V)**, não pelo 3V3. Em 3,3 V o HC-SR501 fica instável.
5. Afaste o sensor da antena do NodeMCU (a ponta com o desenho em zigue-zague). O Wi-Fi gera falsos disparos.
6. Depois de ligar, espere ~1 min antes de testar. O monitor serial mostra `[PIR] aquecendo`.

**Teste:** passar a mão deve ligar o V11 em menos de 1 s no Blynk, e ele não pode piscar durante a permanência.

## Datastreams no Blynk.Console

| Pino | Nome | Tipo | Faixa |
|---|---|---|---|
| V14 | Detecções hoje | Integer | 0–1000 |
| V6 | Claro/Escuro (só com `USAR_LDR 1`) | String | — |
| V10 | Luminosidade (só com `USAR_LDR 1`) | Integer | 0–100 (%) |
| V12 | Distância do carro (só com `USAR_HCSR04 1`) | Integer | 0–200 (cm) |

## Regras no modo automático

- Janela abre com ≥ 30 °C e fecha com ≤ 27 °C (DHT11 → servo).
- Luz acompanha a presença (PIR). Com `USAR_LDR 1` passa a exigir também ambiente escuro (< 35 %),
  e `LUZ_SO_NO_ESCURO = false` volta à regra só de presença.
- Alarme armado + movimento no PIR → buzzer por 4 s.

## Ligações dos sensores opcionais

- **LDR (divisor de tensão):** `3V3 — LDR — A0 — resistor 10 kΩ — GND`. Mais luz → valor maior.
  Se ficar invertido (escuro marcando 100 %), troque o LDR e o resistor de lugar.
- **HC-SR04:** VCC no **VIN/5V**, GND no GND, TRIG no **D4**. O ECHO sai com 5 V, por isso passa por um
  divisor antes do D6: `ECHO — 1 kΩ — D6 — 2 kΩ — GND` (2 kΩ = dois de 1 kΩ em série). Sem o divisor
  o ESP8266 pode queimar.
- **Botão com o HC-SR04:** o D6 vira ECHO e o botão vai para o **D3** (dá para usar o botão FLASH da placa).
  Não segure o botão enquanto liga/reseta a placa (D3 em LOW no boot entra em modo de gravação).

## Onde cada coisa aparece na casa 3D

| Peça real | Na casa 3D |
|---|---|
| NodeMCU | Placa na caixa de vidro ao lado da porta (LED azul pisca quando online) |
| PIR | Sensor branco ao lado da porta + cone de detecção + holograma na entrada |
| DHT11 | Caixa azul na parede leste, perto da janela; valor também na TV da sala e no painel do andar de cima |
| LED D1 | Luzes da casa |
| LED D0 | Porta abre/fecha e LED da fechadura verde/vermelho |
| Servo D7 | Janelas, porta de correr do terraço e cortinas |
| Buzzer D8 | Sirene vermelha na cobertura |
| LDR / HC-SR04 (desligados) | Cúpula na cobertura / poste e carro na garagem — escondidos no app (ver `SENSORES` no `app-3d`) |
