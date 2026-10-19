# Mini Casa Inteligente — contexto para o Claude Code

Projeto final de **Internet das Coisas e do Comportamento (IoT + IoB)** — FEPI, Sistemas de Informação,
Prof. Evaldo Renó. Relatório (40 pts) para **21/11/2026**; a demonstração é ao vivo no PC do Lucas
(casa 3D) + celular (controle/painel). Idioma do projeto: **português do Brasil** (código comentado em PT-BR).

Leia também: `docs/HISTORICO.md` (o que já foi feito e por quê) e `docs/ROADMAP.md` (o que falta, por issue).

## Arquitetura

```
Protoboard ── NodeMCU ESP8266 ── Wi-Fi ──► Blynk Cloud ◄── HTTP (API externa) ── app-3d/server.js ── SSE ──► navegador (casa 3D)
                                                 ▲                                                           │
                                                 └──────────── comandos (/api/command → /external/api/update) ┘
```

- `firmware/casa_inteligente/` — sketch Arduino (arduino-cli, FQBN `esp8266:esp8266:nodemcuv2`, core 3.1.2).
  `secrets.h` (token, Wi-Fi, senha OTA) **nunca vai para o git**; modelo em `secrets.example.h`. `ota.h` = Blynk.Air + ArduinoOTA.
- `app-3d/server.js` — Express 5. Modo **ao vivo** (com `BLYNK_TOKEN`) consulta o Blynk a cada `POLL_INTERVAL_MS` só enquanto
  há página aberta; modo **demonstração** (sem token ou `DEMO=true`) simula sensores com as mesmas regras do firmware.
  Rotas: `GET /api/state`, `GET /api/stream` (SSE), `POST /api/command {pin,value}`, `POST /api/sim` (só demo).
- `app-3d/public/` — three.js r186 servido de `node_modules` (`/vendor/three`), sem build.
  - `js/main.js` renderer, perfis de qualidade (alta/média/leve + FPS), pós-processamento, câmeras/enquadramento, céu, loop.
  - `js/world.js` toda a cena (casa, terreno, folhagem, carro, dispositivos IoT, luzes) + `setState()`/`update()`.
  - `js/ui.js` painel, faixa compacta, layouts (Painel/Compacto/Foco), hotspots, eventos, seletor de céu, conexão SSE.
  - `js/atmosphere.js` céu, sol/lua, estrelas, nuvens, vaga-lumes. `js/textures.js` texturas procedurais em canvas.
- `.vscode/tasks.json` + `scripts/*.ps1` — gravar USB (Ctrl+Shift+B), Wi-Fi (ArduinoOTA), `.bin` para Blynk.Air, monitor serial.

## Hardware em uso HOJE (18/10/2026)

| Peça | Pino | Blynk |
|---|---|---|
| LED luz | D1 | V0 |
| LED trava da porta | D0 | V1 |
| Servo SG90 (janelas) | D7 | V2 comando · V7 status (ABERTA/FECHADA) |
| Modo automático | — | V3 |
| DHT11 | D2 | V4 temperatura · V5 umidade |
| Buzzer | D8 | V8 status do alarme |
| Botão arma/desarma | **D6** (versão 1.0.0) | V9 alarme armado |
| PIR HC-SR501 | D5 | V11 presença |

**LDR e HC-SR04 foram retirados do protoboard** (instáveis, atrapalhavam a presença). A placa roda o firmware
sem eles (equivalente à 1.0.0). O repositório ainda tem a 1.1.0 com LDR/HC-SR04 → ver issue F1 (flags `USAR_LDR`/`USAR_HCSR04`).
No app, V6/V10 (LDR) e V12 (HC-SR04) ainda aparecem → issue B6.

Regras do firmware (modo automático): janela abre ≥ 30 °C e fecha ≤ 27 °C; luz segue a presença; alarme armado +
presença → buzzer 4 s. Comandos de atuador só valem no modo manual (o app troca para manual ao clicar).

## Como rodar

- Casa 3D: tarefa **Casa 3D: iniciar** (ou `cd app-3d && npm install && npm start`). `.env` com `BLYNK_TOKEN`,
  `BLYNK_SERVER` (região), `PORT`, `POLL_INTERVAL_MS`, `DEMO`. Sem token = demonstração.
- URL úteis: `?q=high|medium|low`, `?view=geral|sala|entrada|janela|garagem|cobertura|corte`,
  `?layout=painel|compacto|foco`, `?dock=left`, `?ceu=ldr|relogio|manual`, `?hora=21`,
  `?shot=1&frames=N` (renderiza N quadros e para; usado para capturas com Playwright).
- Firmware: tarefa **ESP8266: gravar pela USB**. A cada envio pelo Blynk.Air, subir `BLYNK_FIRMWARE_VERSION`.

## Armadilhas já conhecidas (não repetir)

1. **`mergeStatic()` (fim de `world.js`) junta tudo que é estático por material.** Qualquer objeto que se mova/gire precisa de
   `userData.dynamic = true` no grupo (porta, caixilhos do servo, carro, holograma, copas, anéis, feixe do sonar).
   Filhos de meshes unidos vão para um "holder" com a mesma transformação. Esquecer isso já fez porta e janelas sumirem.
2. **NaN no shader apaga a tela inteira** (o bloom espalha). Em shaders próprios: nunca `pow()` com base que pode ser negativa
   (use `clamp`), normalize vetores interpolados. Há uma proteção `safeTex` em `main.js` (max antes de min — no DirectX `max(NaN,0)=0`).
3. **Luzes pontuais custam em todo pixel**, mesmo apagadas: não adicionar luzes; preferir emissivo + "poças de luz" (`lightPool`).
   Nenhuma luz pontual projeta sombra. A sombra do sol é sob demanda (`renderer.shadowMap.autoUpdate = false`;
   `world.S.moving` / mudança do céu marcam `shadowDirty`).
4. **Mudar o número de luzes recompila shaders** (trava). Liga/desliga = intensidade, nunca add/remove.
5. **Transmissão (`transmission`) em material renderiza a cena 2×** — só o vidro no perfil alto usa.
6. Perfis: o mundo é montado uma vez com o perfil inicial (`buildTier`); rebaixar em tempo real só muda pós-processamento.
7. Segredos: nunca commitar `secrets.h`, `.env` nem o token. O `.gitignore` já cobre.

## Convenções

- Commits em português, imperativo curto no título + corpo com tópicos (ver `git log`). Uma branch por issue:
  `fix/…`, `feat/…`, `visual/…`, `docs/…`. Referenciar a issue no commit (`Fecha #12`).
- Validar mudanças visuais com captura (modo `?shot`) antes de concluir; checar console sem erros.
- Mudanças pequenas e focadas por issue; não reescrever arquivos inteiros sem necessidade.
