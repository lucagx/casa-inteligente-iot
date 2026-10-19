# Mini Casa Inteligente — IoT + IoB

Projeto final de **Internet das Coisas e do Comportamento** (FEPI · Sistemas de Informação).
NodeMCU ESP8266 com sensores e atuadores, controlado pelo Blynk e espelhado em tempo real
por um gêmeo digital 3D.

```
app-3d/      Casa 3D + servidor ponte com o Blynk (Node.js, three.js)
firmware/    Firmware do NodeMCU ESP8266 (credenciais em secrets.h, fora do git)
scripts/     Tarefas do VS Code: instalar, gravar USB, gravar Wi-Fi, gerar .bin
wokwi/       diagram.json e libraries.txt do simulador (versão ESP32-S3, referência)
docs/        Relatório, documento inicial, guia de testes, capturas de tela
```

## Primeira vez em um PC

1. Abra a pasta no VS Code.
2. `Ctrl+Shift+P` → *Tasks: Run Task* → **ESP8266: instalar ferramentas**.
3. Preencha `firmware/casa_inteligente/secrets.h` (token do Blynk, Wi-Fi, senha do OTA).
4. Placa no USB → `Ctrl+Shift+B` (**ESP8266: gravar pela USB**).

Detalhes, pinagem e atualização pelo Wi-Fi: [`firmware/README.md`](firmware/README.md).

## Casa 3D

Tarefa **Casa 3D: iniciar**, ou:

```bash
cd app-3d
npm install
npm start          # http://localhost:3000
```

Sem `app-3d/.env` abre em **modo demonstração**. Para espelhar a placa, copie
`app-3d/.env.example` para `app-3d/.env` e preencha `BLYNK_TOKEN` e `BLYNK_SERVER`.
