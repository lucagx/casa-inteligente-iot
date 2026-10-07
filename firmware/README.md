# Firmware do ESP32-S3

Coloque aqui o firmware **em uso** (a versão ajustada que conecta ao Arduino real), em
`firmware/casa_inteligente/casa_inteligente.ino`. A pasta precisa ter o mesmo nome do `.ino`
para a Arduino IDE / arduino-cli abrirem o projeto.

A casa 3D (`app-3d/`) espera estes pinos virtuais no Blynk:

| Pino | Conteúdo | Pino | Conteúdo |
|---|---|---|---|
| V0 | luz 0/1 | V6 | CLARO / ESCURO |
| V1 | porta 0/1 | V7 | ABERTA / FECHADA |
| V2 | comando da janela 0/1 | V8 | ARMADO / DESARMADO / ALARME ATIVO |
| V3 | modo automático 1 / manual 0 | V9 | alarme armado 0/1 |
| V4 | temperatura °C | V10 | luminosidade 0–100 % |
| V5 | umidade % | V11 | presença 0/1 |

Se o firmware em uso tiver outros pinos, ajuste `PINS`/`WRITABLE` em `app-3d/server.js`
e o mapeamento em `app-3d/public/js/ui.js` e `world.js`.
