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
| LED porta | D0 | V1 |
| Servo SG90 (janela) | D7 | V2 comando · V7 status |
| DHT11 | D2 | V4 temperatura · V5 umidade |
| PIR HC-SR501 | D5 | V11 presença |
| Buzzer | D8 | V8 status do alarme |
| Botão (arma/desarma) | D6 (INPUT_PULLUP) | V9 alarme armado |
| — | — | V3 modo automático |

Regras no modo automático: janela abre com ≥ 30 °C e fecha com ≤ 27 °C; a luz acompanha a presença.
