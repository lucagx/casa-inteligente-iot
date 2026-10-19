# Roadmap — reta final (até 21/11/2026)

Fonte única do backlog: `docs/issues.json` (gera as issues do GitHub com `scripts/criar-issues.ps1`).
Contexto e armadilhas: `CLAUDE.md`. O que já foi feito: `docs/HISTORICO.md`.

## Como trabalhar

1. Pegue a próxima issue do marco atual (ordem da tabela).
2. `git switch -c fix/b1-tv` (prefixos `fix/`, `feat/`, `visual/`, `docs/`).
3. Peça ao Claude Code: *"Resolva a issue B1 do docs/ROADMAP.md seguindo o CLAUDE.md"*.
4. Teste (demonstração + ao vivo), commit com `Fecha #N`, merge na `main` (o Render publica sozinho depois do H2).

## M1 · Correções rápidas — até 25/10

Bugs visuais, firmware sem LDR/HC-SR04, presença estável, senha antes de publicar.

| ID | Issue | Etiquetas |
|---|---|---|
| F1 | Firmware 1.2.0 sem LDR/HC-SR04 (flags) e botão no D6 | firmware, hardware |
| F2 | Presença estável: retenção no firmware + ajuste do HC-SR501 | firmware, hardware |
| B1 | TV da sala com dados errados/diferentes do card | bug, app-3d |
| B2 | Sofá atravessando a parede de vidro da sala | bug, visual, app-3d |
| B3 | Espreguiçadeiras da piscina atravessando a borda | bug, visual, app-3d |
| B4 | Clarão de luz ao abrir a casa (luminária da piscina e luzes internas) | bug, visual, app-3d |
| B6 | Desativar LDR e HC-SR04 no app por configuração | app-3d, backend |
| H1 | Senha no painel antes de publicar | infra, backend |

## M2 · Hospedagem, presença e Blynk — até 01/11

Render no ar, histórico, presença rápida, luzes noturnas, Blynk organizado.

| ID | Issue | Etiquetas |
|---|---|---|
| B5 | Presença aparece com atraso na tela | bug, backend, app-3d |
| V2 | Iluminação noturna externa e da piscina | visual, app-3d |
| H2 | Publicar no GitHub e no Render | infra, docs |
| H3 | Banco do histórico (Postgres gratuito) para o IoB | infra, backend |
| K1 | Blynk: datastreams organizados | blynk |
| K2 | Blynk: dashboard web e app reorganizados | blynk |

## M3 · Painel IoB no celular — até 08/11

Painel /painel com controles, cenas, gráficos e consumo.

| ID | Issue | Etiquetas |
|---|---|---|
| I1 | Painel /painel no celular (PWA) — base e controles | painel-iob, app-3d |
| I2 | Gráficos e linha do tempo no painel | painel-iob, backend |
| I3 | Consumo de energia e economia | painel-iob, backend |
| I4 | Cenas de um toque: Cheguei, Saí, Dormir, Apresentação | painel-iob, backend |

## M4 · Inteligência IoB e acabamento — até 15/11

Rotina, conforto adaptativo, alertas, privacidade, eventos/automações Blynk, folhagem.

| ID | Issue | Etiquetas |
|---|---|---|
| F3 | Log de eventos no Terminal do Blynk (V13) e Blynk.logEvent | firmware, blynk |
| V1 | Folhagem, grama e arbustos consistentes com a casa | visual, app-3d |
| V3 | Carro sem HC-SR04: carregador do carro elétrico e cena Cheguei | visual, app-3d, painel-iob |
| I5 | Rotina aprendida e modo ausente | painel-iob, backend |
| I6 | Conforto adaptativo da janela | painel-iob, backend, firmware |
| I7 | Insights diários e alertas | painel-iob, backend, blynk |
| I8 | Privacidade e consentimento (ética do IoB) | painel-iob, docs |
| K3 | Blynk: eventos e automações | blynk |

## M5 · Entrega — até 21/11

Relatório, capturas, roteiro e plano B da apresentação.

| ID | Issue | Etiquetas |
|---|---|---|
| E1 | Relatório e README com a arquitetura final | docs |
| E2 | Roteiro da apresentação ao vivo e plano B | docs |

## Detalhe das issues

### [F1] Firmware 1.2.0 sem LDR/HC-SR04 (flags) e botão no D6

Marco: M1 · Etiquetas: firmware, hardware

**Contexto:** LDR e HC-SR04 saíram do protoboard; a placa roda o código sem eles (botão em D6), mas o repositório tem a 1.1.0.
**Onde:** `firmware/casa_inteligente/casa_inteligente.ino`, `firmware/README.md`.
**Como:** `#define USAR_LDR 0` e `#define USAR_HCSR04 0` envolvendo leitura, publicação (V6/V10/V12) e `pinMode`; botão volta para D6;
com `USAR_LDR 0` a luz automática segue só a presença. Subir `BLYNK_FIRMWARE_VERSION` para 1.2.0. Atualizar pinagem no README.
**Pronto quando:** compila (tarefa *compilar*), gravado na placa, comportamento igual ao atual e reativável trocando as flags.

### [F2] Presença estável: retenção no firmware + ajuste do HC-SR501

Marco: M1 · Etiquetas: firmware, hardware

**Contexto:** a presença às vezes demora, às vezes oscila (liga/desliga rápido).
**Hardware (guia no README):** jumper em **H** (redisparo/repetível); trimpot de **tempo no mínimo** (girar todo no sentido anti-horário); sensibilidade no meio;
alimentar por **VIN 5 V**; ignorar os primeiros ~60 s após ligar (aquecimento); afastar o sensor da antena do NodeMCU.
**Firmware:** `PRESENCA_RETENCAO_MS` (ex.: 8000) — presença liga na borda de subida e **publica V11 na hora**; só desliga após N ms sem sinal.
Ignorar leituras durante o aquecimento. Contador de detecções do dia (para V14/painel).
**Pronto quando:** passar a mão liga em < 1 s no Blynk e não pisca durante a permanência.

### [F3] Log de eventos no Terminal do Blynk (V13) e Blynk.logEvent

Marco: M4 · Etiquetas: firmware, blynk

**Contexto:** o Terminal do dashboard está vazio e não conta o que acontece.
**Como:** função `logTerminal(texto)` escrevendo em V13 (`"20:14 PIR → luz ON (auto)"`, janela, alarme, modo); `Blynk.logEvent()` para os eventos de K3.
Hora via `Blynk.sendInternal("rtc","sync")` ou BLYNK_WRITE(InternalPinRTC).
**Pronto quando:** cada ação aparece no Terminal com hora e origem (auto/manual/botão).

### [B1] TV da sala com dados errados/diferentes do card

Marco: M1 · Etiquetas: bug, app-3d

**Bugs confirmados:** a TV testa `meta.live` (não existe) → sempre "CASA · DEMONSTRAÇÃO"; umidade aparece crua (`V5`); card "LUZ" usa LDR (removido);
relógio só redesenha quando chega estado.
**Onde:** `app-3d/public/js/world.js` → `drawTV()` (~1086) e `setState()`.
**Como:** `meta.mode === 'live'`; um formatador único (ex.: `fmt.temp(v)`, `fmt.umid(v)`) usado por card, faixa compacta, hotspot e TV;
trocar card LUZ por PRESENÇA ou MODO; redesenhar a cada minuto. Mostrar "última leitura hh:mm:ss".
**Pronto quando:** card e TV mostram o mesmo valor ao vivo (testar com Blynk real) e o rótulo diz AO VIVO.

### [B2] Sofá atravessando a parede de vidro da sala

Marco: M1 · Etiquetas: bug, visual, app-3d

**Onde:** `world.js` ~462–468 (`const sx = -2.1, sz = 1.2;` sofá + chaise); vidro da sala em z = 3,5.
**Como:** recuar o conjunto (z) e/ou encurtar a chaise; conferir na vista Sala e de fora (Visão geral) com captura.
**Pronto quando:** nenhum ponto do sofá passa do vidro em nenhuma vista.

### [B3] Espreguiçadeiras da piscina atravessando a borda

Marco: M1 · Etiquetas: bug, visual, app-3d

**Onde:** `world.js` ~627 (espreguiçadeiras da piscina; piscina em px=-3.6, pz=8.9, 6×3 m, borda de pedra 0.35).
**Como:** afastar para o gramado/deck (z > 10.75) ou girar paralelas à borda.
**Pronto quando:** não encostam/atravessam a borda nem a água.

### [B4] Clarão de luz ao abrir a casa (luminária da piscina e luzes internas)

Marco: M1 · Etiquetas: bug, visual, app-3d

**Contexto:** com a luz ligada à noite aparece uma estrela forte na borda da piscina e reflexo intenso no interior/cozinha.
**Onde:** `M.poolLight` (`world.js` ~94, ~624, intensidade em `update()` ~1145) e `lightMats` (luminárias) + bloom (`atmosphere.js`).
**Como:** emissivo da luminária bem menor e substituir por brilho subaquático (ver V2); limitar o brilho das luminárias internas;
conferir threshold do bloom por perfil.
**Pronto quando:** nenhuma área "estoura" para branco nas vistas Visão geral, Sala e Entrada à noite.

### [B5] Presença aparece com atraso na tela

Marco: M2 · Etiquetas: bug, backend, app-3d

**Onde:** `app-3d/server.js` (`POLL_MS`, `pollBlynk`), `ui.js`, `world.js` (holograma).
**Como:** consulta rápida só do `V11` (ex.: a cada 400 ms) separada da consulta geral; opcional: webhook do Blynk (1 no plano grátis) para POST imediato
no servidor publicado; na tela "última detecção há X s", contador do dia e holograma visível no mínimo 3 s.
**Pronto quando:** do disparo no PIR até a tela < ~1,5 s com o servidor no Render.

### [B6] Desativar LDR e HC-SR04 no app por configuração

Marco: M1 · Etiquetas: app-3d, backend

**Como:** `app-3d/public/js/config.js` com `SENSORES = { ldr: false, garagem: false }` (e `.env` `SENSORES=` no servidor) para esconder cards,
hotspots, poste/barra da garagem, slider de simulação e parar de ler/simular V6/V10/V12; céu padrão **Relógio** sem LDR.
O código fica — reativar é trocar a flag.
**Pronto quando:** nada de LDR/HC-SR04 aparece com as flags desligadas e tudo volta ao ligá-las.

### [V1] Folhagem, grama e arbustos consistentes com a casa

Marco: M4 · Etiquetas: visual, app-3d

**Problemas (prints de 18/10):** árvores com cartões de folha "espetados"; grama em lâminas PNG finas espalhadas; arbustos = esfera escura;
flores = bolinhas coloridas. Mistura de 2D com 3D destoa da arquitetura limpa.
**Onde:** `world.js` `foliage()` ~739, `tree()` ~772, arbustos ~797, flores ~806, grama ~830; texturas em `textures.js`.
**Direção:** estilo único low-poly: copas como aglomerados de icosaedros com variação de cor por vértice e sombra própria (sem cartões);
arbustos do mesmo jeito; flores como pequenos tufos 3D instanciados (ou retirar); grama mais baixa, densa, da cor do chão e sumindo com a distância
(ou só textura de chão bem feita). Manter `userData.dynamic` nas copas que balançam.
**Pronto quando:** Visão geral e Entrada (dia e noite) sem elementos "chapados"; chamadas de desenho não aumentam muito (medir).

### [V2] Iluminação noturna externa e da piscina

Marco: M2 · Etiquetas: visual, app-3d

**Como:** piscina com brilho subaquático ciano + cáusticas animadas no fundo; halos nos balizadores; spots de chão iluminando copas;
luz rasante na fachada; fita LED sob o deck. Tudo emissivo/poças de luz (sem luzes novas). Regra IoB: externas acendem ao anoitecer pelo relógio.
**Pronto quando:** captura noturna da Visão geral mostra o jardim e a piscina legíveis e bonitos sem clarões.

### [V3] Carro sem HC-SR04: carregador do carro elétrico e cena Cheguei

Marco: M4 · Etiquetas: visual, app-3d, painel-iob

**Ideia:** o carro vira parte do IoB de consumo: **carregador** ligável pelo app/Blynk (reaproveitar V12), com cabo, LED de carga, % de bateria
e kWh entrando no consumo (I3), sugerindo carregar fora do horário de ponta (tarifa branca). A cena **Cheguei** (I4) anima o carro entrando.
**Pronto quando:** ligar o carregador muda o visual, o consumo e o Blynk.

### [H1] Senha no painel antes de publicar

Marco: M1 · Etiquetas: infra, backend

**Contexto:** link público controla a casa (luz, porta, alarme).
**Como:** middleware de Basic Auth no Express quando `PAINEL_SENHA` existir (usuário fixo, ex. `casa`), cobrindo páginas, `/api/*` e SSE;
em dev sem a variável fica aberto.
**Pronto quando:** sem senha → 401; com senha → tudo funciona, inclusive o stream.

### [H2] Publicar no GitHub e no Render

Marco: M2 · Etiquetas: infra, docs

**Passos:** publicar o repo (privado) pelo VS Code → Render: New → Web Service → conectar o repo → **Root Directory `app-3d`**,
Build `npm ci`, Start `node server.js`, plano Free; variáveis `BLYNK_TOKEN`, `BLYNK_SERVER`, `PAINEL_SENHA`, `POLL_INTERVAL_MS`, `NODE_VERSION=20`;
Health check `/api/state`. Opcional: monitor (UptimeRobot) chamando `/api/state` a cada 10 min para não dormir (750 h grátis/mês cobrem o mês).
Documentar em `docs/HOSPEDAGEM.md`.
**Atenção:** free dorme após 15 min sem tráfego (volta em ~1 min); disco não é persistente → histórico em banco externo (H3).
**Pronto quando:** link `onrender.com` abre a casa ao vivo com senha; deploy automático a cada push na `main`.

### [H3] Banco do histórico (Postgres gratuito) para o IoB

Marco: M2 · Etiquetas: infra, backend

**Contexto:** Render free não tem disco persistente e o Postgres grátis dele expira em 30 dias (cairia antes/perto da entrega).
**Como:** Postgres gratuito externo (ex.: Neon ou Supabase) via `DATABASE_URL`; módulo `app-3d/server/history.js` com tabelas
`leituras(ts, pino, valor)` e `eventos(ts, tipo, origem, detalhe)`; gravar só mudanças + amostra de temp/umid a cada 5 min;
sem `DATABASE_URL` → memória (dev). Rotas `GET /api/history?desde=&pinos=` e `GET /api/events`.
**Pronto quando:** reiniciar o servidor não perde histórico; consultas de 7 dias respondem rápido.

### [I1] Painel /painel no celular (PWA) — base e controles

Marco: M3 · Etiquetas: painel-iob, app-3d

**Objetivo:** controle completo da casa no celular, sem 3D: estado ao vivo (SSE), todos os atuadores, modo auto/manual, alarme, carregador,
status da placa; instalável (manifest + service worker), tema escuro igual à casa 3D.
**Onde:** `app-3d/public/painel/` servido pelo mesmo servidor (mesma senha).
**Pronto quando:** abre no celular pelo link do Render, instala na tela inicial e controla a placa.

### [I2] Gráficos e linha do tempo no painel

Marco: M3 · Etiquetas: painel-iob, backend

**Conteúdo:** temperatura/umidade 24 h e 7 dias; **mapa de calor de presença por hora × dia**; tempo de luz ligada por dia;
linha do tempo de eventos (quem fez: auto/manual/botão/cena). Biblioteca leve (ex.: uPlot ou Chart.js via npm, servida localmente).
**Pronto quando:** gráficos carregam do `/api/history` e atualizam ao vivo.

### [I3] Consumo de energia e economia

Marco: M3 · Etiquetas: painel-iob, backend

**Como:** tabela de potência por dispositivo (config), tempo ligado → kWh e R$ por dia/semana/mês; `TARIFA_KWH` e horários de ponta
(tarifa branca); meta mensal; card "você economizou X% vs. semana passada" e dica (IoB influenciando comportamento). Inclui o carregador (V3).
Publicar consumo do dia em V15 no Blynk.
**Pronto quando:** números coerentes com o histórico e visíveis no painel e no Blynk.

### [I4] Cenas de um toque: Cheguei, Saí, Dormir, Apresentação

Marco: M3 · Etiquetas: painel-iob, backend

**Como:** `POST /api/scene {nome}` aplica vários pinos em sequência (ex.: Saí = luz off, porta trancada, janelas fechadas, alarme armado);
botões no painel, no Blynk (menu V16) e na casa 3D; registro no histórico.

### [I5] Rotina aprendida e modo ausente

Marco: M4 · Etiquetas: painel-iob, backend

**Como:** a partir do histórico de presença, horário típico de chegada/saída por dia da semana → sugestão "acender entrada às 18:50?";
sem presença por X h → sugerir armar alarme; modo ausente simula luzes no padrão aprendido (anti-furto).

### [I6] Conforto adaptativo da janela

Marco: M4 · Etiquetas: painel-iob, backend, firmware

**Como:** quando o usuário abre/fecha a janela manualmente, registrar a temperatura; ajustar o limite automático (média móvel) e enviar à placa
(novo pino, ex. V17 `limiteAbrir`) — o comportamento muda a regra (essência do IoB). Mostrar no painel "limite aprendido: 28,5 °C".

### [I7] Insights diários e alertas

Marco: M4 · Etiquetas: painel-iob, backend, blynk

**Como:** card diário (detecções, pico de presença, luz ligada, janela aberta N×, consumo); alertas: porta destrancada > 10 min,
movimento com alarme armado, temperatura alta com janela fechada no manual. Push via eventos do Blynk (K3).

### [I8] Privacidade e consentimento (ética do IoB)

Marco: M4 · Etiquetas: painel-iob, docs

**Como:** tela no painel explicando o que é coletado, por quanto tempo (retenção configurável), quem acessa; botões "pausar coleta" e
"apagar histórico". Texto também no relatório.

### [K1] Blynk: datastreams organizados

Marco: M2 · Etiquetas: blynk

**Como:** nomes claros, unidades, min/max e casas decimais (V4 °C 1 casa, V5 %); remover V6/V10 (LDR); **V12 vira Carregador**;
criar V13 Log (String), V14 Detecções hoje (Integer), V15 Consumo hoje (Double, kWh), V16 Cena (menu). Limite do plano grátis é incerto
(5–20 por template) — conferir no Console ao criar.

### [K2] Blynk: dashboard web e app reorganizados

Marco: M2 · Etiquetas: blynk

**Layout:** Linha 1 gauges temp/umid, LED presença + rótulo "última detecção", status do alarme colorido; Linha 2 switches com nome
(Luz D1, Porta D0, Janelas D7, Alarme, Carregador), seletor Auto/Manual, menu Cenas; Linha 3 SuperChart temp/umid (1h/1d/1sem) e presença (barras);
Linha 4 Terminal (V13). Mesmo layout no app do celular. Capturar telas para o relatório.

### [K3] Blynk: eventos e automações

Marco: M4 · Etiquetas: blynk

**Eventos (plano grátis: 5):** alarme_disparado (push), porta_aberta_tempo, temp_alta, presenca (timeline), offline.
**Automações (5):** luz externa ao pôr do sol, armar alarme 23h, resumo diário, carregar carro em horário fora de ponta.

### [E1] Relatório e README com a arquitetura final

Marco: M5 · Etiquetas: docs

Atualizar README e relatório: arquitetura final (Render + Blynk + painel IoB), onde está IoT × IoB, código gravado, telas do app/Blynk
(capturas novas), limitações (LDR/HC-SR04 retirados e por quê) e ética de dados.

### [E2] Roteiro da apresentação ao vivo e plano B

Marco: M5 · Etiquetas: docs

Roteiro de 5–7 min: protoboard ↔ casa 3D ↔ celular ↔ Blynk; cenas; gráficos/consumo; plano B se cair a internet (modo demonstração local,
vídeo gravado). Ensaiar com o servidor do Render "acordado" antes de começar.
