# Mini Casa Inteligente — IoT + IoB

Projeto final de **Internet das Coisas e do Comportamento** (FEPI · Sistemas de Informação).
ESP32-S3 com sensores e atuadores, controlado pelo Blynk, simulado no Wokwi e espelhado
em tempo real por um gêmeo digital 3D.

```
app-3d/      Casa 3D + servidor ponte com o Blynk (Node.js, three.js)
firmware/    Código do ESP32-S3 (o mesmo arquivo serve para Wokwi e placa real)
wokwi/       diagram.json e libraries.txt do simulador
docs/        Relatório, documento inicial, guia de testes, capturas de tela
```

## Rodar a casa 3D

```bash
cd app-3d
npm install
npm start          # http://localhost:3000
```

Sem `.env`, abre em **modo demonstração** (sensores simulados). Para ligar ao ESP32 real ou ao
Wokwi, copie `app-3d/.env.example` para `app-3d/.env` e preencha `BLYNK_TOKEN` e `BLYNK_SERVER`.

## Firmware

`firmware/casa_inteligente/casa_inteligente.ino`. No topo do arquivo:

| Chave | Valor | Uso |
|---|---|---|
| `NO_WOKWI` | `1` / `0` | simulador / placa real |
| `USAR_BLYNK` | `0` / `1` | só circuito (comandos pelo Monitor Serial) / conectado ao Blynk |

Pinos: DHT22 GPIO4 · LDR GPIO1 · HC-SR04 GPIO5/6 · Servo GPIO7 · LED luz GPIO15 · LED porta GPIO16 · Buzzer GPIO17.
Pinos virtuais do Blynk: V0–V11 (tabela completa em `docs/Guia_Testes_Wokwi_Blynk.docx`).

> Não faça commit do `.env` nem de um firmware com o token real. O `.gitignore` já ignora o `.env`.
