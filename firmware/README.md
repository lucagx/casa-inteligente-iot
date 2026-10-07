# Firmware — NodeMCU ESP8266

`casa_inteligente/casa_inteligente.ino` é o firmware em uso. Credenciais ficam em
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

## Pinagem

| Componente | Pino NodeMCU | Blynk |
|---|---|---|
| LED luz | D1 | V0 |
| LED porta (trava) | D0 | V1 |
| Servo SG90 (janela) | D7 | V2 comando · V7 status |
| DHT11 | D2 | V4 temperatura · V5 umidade |
| PIR HC-SR501 | D5 | V11 presença |
| Buzzer | D8 | V8 status do alarme |
| Botão (arma/desarma) | **D3** (botão FLASH da placa ou externo para GND) | V9 alarme armado |
| LDR | A0 | V10 luminosidade % · V6 CLARO/ESCURO |
| HC-SR04 TRIG | D4 | — |
| HC-SR04 ECHO | D6 **com divisor** | V12 distância do carro (cm) |
| — | — | V3 modo automático |

### Ligações novas

- **LDR (divisor de tensão):** `3V3 — LDR — A0 — resistor 10 kΩ — GND`. Mais luz → valor maior.
  Se ficar invertido (escuro marcando 100 %), troque o LDR e o resistor de lugar.
- **HC-SR04:** VCC no **VIN/5V**, GND no GND, TRIG no **D4**. O ECHO sai com 5 V, por isso passa por um
  divisor antes do D6: `ECHO — 1 kΩ — D6 — 2 kΩ — GND` (2 kΩ = dois de 1 kΩ em série). Sem o divisor
  o ESP8266 pode queimar.
- **Botão:** saiu do D6 (agora é o ECHO) e foi para o **D3**. Dá para usar o próprio botão FLASH da
  placa. Não segure o botão enquanto liga/reseta a placa (D3 em LOW no boot entra em modo de gravação).

### Datastreams para criar no Blynk.Console

| Pino | Nome | Tipo | Faixa |
|---|---|---|---|
| V6 | Claro/Escuro | String | — |
| V10 | Luminosidade | Integer | 0–100 (%) |
| V12 | Distância do carro | Integer | 0–200 (cm) |

## Regras no modo automático

- Janela abre com ≥ 30 °C e fecha com ≤ 27 °C (DHT11 → servo).
- Luz acende com movimento no PIR **e** ambiente escuro no LDR (< 35 %). De dia, o movimento não
  acende a luz. Para voltar à regra antiga (só presença), mude `LUZ_SO_NO_ESCURO` para `false`.
- Alarme armado + movimento no PIR → buzzer por 4 s.
- HC-SR04 só mede e publica; na casa 3D o carro anda até a distância medida e a barra de LEDs da
  garagem fica verde (≤ 80 cm), âmbar (≤ 30 cm) ou vermelha piscando (≤ 10 cm).

## Onde cada coisa aparece na casa 3D

| Peça real | Na casa 3D |
|---|---|
| NodeMCU | Placa na caixa de vidro ao lado da porta (LED azul pisca quando online) |
| PIR | Sensor branco ao lado da porta + cone de detecção + holograma na entrada |
| DHT11 | Caixa azul na parede leste, perto da janela; valor também na TV da sala |
| LDR | Cúpula na cobertura; deixa o céu/iluminação em modo dia ou noite |
| HC-SR04 | Poste no fundo da garagem com barra de LEDs; o carro acompanha a distância |
| LED D1 | Luzes da casa |
| LED D0 | Porta abre/fecha e LED da fechadura verde/vermelho |
| Servo D7 | Janela da parede leste (vista "Janela") |
| Buzzer D8 | Sirene vermelha na cobertura |
