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
| Servo SG90 | D7 | V2 (comando) / V7 (status) | 4 janelas abrem juntas: leste e norte (giram ~82°) e 2 basculantes na faixa de vidro do andar de cima |
| DHT11 | D2 | V4 / V5 | Caixa azul na parede leste; temperatura e umidade no painel e na TV da sala |
| LDR *(opcional, desligado)* | A0 | V6 / V10 | Céu muda de dia → entardecer → noite conforme a luz real (modo de céu "LDR") |
| PIR HC-SR501 | D5 | V11 / V14 | Sensor ao lado da porta, cone de detecção e holograma de uma pessoa na entrada; V14 conta as detecções do dia |
| HC-SR04 *(opcional, desligado)* | D4 (TRIG) / D6 (ECHO) | V12 | Poste no fundo da garagem: o carro anda até a distância medida e a barra de LEDs fica verde/âmbar/vermelha |
| Buzzer | D8 | V8 / V9 | Sirene vermelha pisca e varre o jardim com luz |
| Botão | D6 (D3 com o HC-SR04) | V9 | Arma/desarma o alarme (o estado aparece no painel) |
| NodeMCU | — | online/offline | LED azul pulsando na caixa ao lado da porta e anéis de Wi-Fi na antena |

Ligações e datastreams: veja `../firmware/README.md`.

O LDR e o HC-SR04 saíram do protoboard. Com `SENSORES` vazio (padrão) a casa 3D esconde tudo deles
(cartões, faixa compacta, pontos na cena, cúpula do LDR, poste da garagem, simulação e o céu "LDR")
e o servidor não lê nem simula V6/V10/V12. O código continua: `SENSORES=ldr,garagem` religa.

## Configuração (`.env`)

| Variável | Para quê |
|---|---|
| `BLYNK_TOKEN`, `BLYNK_SERVER` | Liga ao Blynk (sem token = modo demonstração) |
| `POLL_INTERVAL_MS` | Intervalo de leitura do Blynk (mínimo 800 ms) |
| `DEMO` | `true` força o modo demonstração |
| `SENSORES` | Sensores opcionais presentes: `ldr`, `garagem` (vírgula). Vazio = nenhum |
| `PAINEL_SENHA` / `PAINEL_USUARIO` | Senha do painel (Basic Auth, usuário padrão `casa`). Obrigatória antes de publicar: o link controla luz, porta e alarme. Vazia = aberto (dev). `/healthz` fica sempre aberto, sem dados, para o health check |

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
2. No Blynk.Console, no template, garanta os datastreams **V0 a V5, V7 a V9, V11 e V14**
   (V14 *Integer*; V6/V10/V12 só se religar os sensores opcionais).
3. Copie `.env.example` para `.env` e preencha `BLYNK_TOKEN` e `BLYNK_SERVER`
   (a região do seu Blynk).
4. `npm start` — o selo no topo muda para **Blynk ao vivo** e **NodeMCU online**.

### Pelo celular

- **Mesma rede Wi-Fi:** ao iniciar, o servidor imprime o endereço (ex.: `http://192.168.0.23:3000`).
  Abra no navegador do celular. No celular a qualidade gráfica ajusta sozinha para "leve".
- **De qualquer lugar:** publique a pasta em um serviço como Render ou Railway e configure
  `BLYNK_TOKEN`, `BLYNK_SERVER` e **`PAINEL_SENHA`** como variáveis de ambiente.

### Painel do celular (`/painel`)

Controle da casa sem o 3D, feito para o celular: temperatura, umidade e presença ao vivo (SSE),
modo automático/manual, luz, porta, janela e alarme, e o estado do Blynk e da placa. Tocar num
atuador com o modo automático ligado passa para o manual, como no painel da casa 3D.

- Abra `http://<servidor>/painel` — usa a mesma senha (`PAINEL_SENHA`) da casa 3D.
- **Instalar na tela inicial:** no Chrome do Android, botão **Instalar** no topo (ou menu → *Instalar app*);
  no iPhone, Safari → Compartilhar → *Adicionar à Tela de Início*. Abre em tela cheia, como um app.
- A instalação e o cache offline só funcionam em **HTTPS** (Render) ou em `localhost`; pelo IP da rede
  (`http://192.168.x.x:3000`) o painel funciona, mas não instala.
- Manifest, service worker e ícones (`/painel/manifest.webmanifest`, `/painel/sw.js`, `/painel/icones/`)
  ficam fora da senha porque o navegador os busca sem credenciais; não têm dados nem controlam nada.

### Luzes por cômodo

O LED do protoboard (**D1, V0**) é a **luz geral** da casa, e cada cômodo (**sala, cozinha, quarto, externa**)
tem a sua luz na casa 3D, com nível 0–100 %. As duas coisas andam juntas, nos dois sentidos:

- algum cômodo aceso ⇒ o D1 acende; o D1 só apaga quando **todos** os cômodos apagam;
- ligar a luz geral (painel, casa 3D, app Blynk, botão ou regra do automático) ⇒ acende todos os cômodos;
  desligar ⇒ apaga todos.

Mexer num cômodo com o modo automático ligado passa para o manual (o firmware só aceita comando de luz no
manual). No automático o firmware continua comandando o D1 pela presença, e os cômodos acompanham.
Os níveis dos cômodos ficam no servidor (`state.rooms`); cada um ainda não tem datastream próprio no Blynk
(dá para criar depois, na K1). API: `POST /api/room {"room":"quarto","level":15}` (`"room":"todos"` = os quatro).

### Cenas de um toque

Botões no painel do celular e na casa 3D que disparam vários comandos em sequência
(definidas em `server/cenas.js`; toda cena começa passando para o manual, porque o firmware só aceita
comando de atuador no modo manual):

| Cena | Luzes (D1 aceso se alguma ficar acesa) | Porta, janela e alarme | Modo no fim |
|---|---|---|---|
| Cheguei | sala, cozinha e externa | desarma e destranca | manual |
| Saí | só a externa (segurança) | tranca, **fecha a janela** e arma | manual |
| Dormir | abajur do quarto a 15 %, externa a 40 % | tranca e arma; **a janela fica como está** (ventilação) | manual |
| Apresentação | acende uma a uma | abre, destranca, arma e desarma, um passo a cada 1,5 s | automático, tudo apagado |

As cenas que deixam luz acesa terminam no manual: no automático o firmware apagaria o D1 sem presença.
Uma cena por vez: enquanto uma roda, as outras ficam travadas (a API responde 409). O andamento vai pelo
stream (`state.scene`) e o feed da casa 3D marca cada mudança com "(cena …)".
API: `GET /api/scenes` (lista) e `POST /api/scene {"nome":"sai","origem":"painel"}`.

## Usando na apresentação

- **Câmeras** (barra inferior): Visão geral, Sala, Entrada, Janela, Garagem, Cobertura e Terreno.
- **Pontos brilhantes na casa** são clicáveis: luz, porta, janela e sirene alternam direto na cena.
  Passe o mouse para ver o nome do componente e a leitura.
- Clicar num atuador com o modo **Automático** ligado muda para **Manual** — igual ao firmware,
  que só aceita comandos manuais nesse modo.
- Roteiro rápido:
  1. Passe a mão no PIR → a luz acende sozinha (IoB) e o contador de detecções (V14) sobe.
  2. Aqueça o DHT11 → a janela abre no protoboard e na casa ao mesmo tempo.
  3. *(só com o HC-SR04 religado)* Aproxime um carrinho do sensor → o carro entra na garagem.
  4. Arme o alarme (botão D6 ou painel) e passe a mão no PIR → holograma, sirene e buzzer.
  5. Troque para Manual e acenda a luz pelo celular → o LED do D1 acende.

### Layouts da tela (botões ao lado das câmeras ou teclas 1, 2, 3)

| Layout | Para quê |
|---|---|
| **Painel** (1) | Painel completo. Arraste pelo cabeçalho para mover; solte na borda esquerda/direita para encaixar, no meio fica flutuando. ⇆ troca de lado, – minimiza, duplo clique volta para a direita |
| **Compacto** (2) | Faixa no canto com todas as leituras e botões rápidos (AUTO/MANUAL, luz, porta, janela, alarme) |
| **Foco** (3) | Apresentação: só a casa, a faixa e as câmeras; o nome de cada componente fica sempre visível |

A lista de eventos pode ser recolhida (botão "Eventos"). A câmera centraliza a casa na área livre
da tela e acompanha quando o painel abre, fecha ou muda de lado. O layout escolhido fica salvo.

### Céu (seção "Céu" no painel)

- **LDR** (só com `SENSORES=ldr`, aí é o padrão): segue o sensor de luz da placa.
- **Relógio** (padrão sem LDR): segue a hora do computador; o sol nasce a leste e se põe a oeste.
- **Manual**: escolha a hora no controle deslizante.

Só muda a visualização: a regra da luz no firmware não depende do céu.

### Qualidade gráfica

O botão de qualidade no fim do painel mostra o perfil e o **FPS** atual, e alterna
automática → alta → média → leve.

| Perfil | Quando | O que usa |
|---|---|---|
| **Alta** | Placa de vídeo dedicada (NVIDIA, Radeon RX, Apple M) | Oclusão de ambiente, bloom, MSAA 4×, sombra 4096, luzes externas reais |
| **Média** | Vídeo integrado recente (Intel UHD/Iris Xe, Radeon integrada) | Bloom, MSAA 4×, sombra 2048 |
| **Leve** | Intel HD antiga, celular ou software | FXAA, sombra 2048, resolução 0,85×, 30 FPS |

No modo automático o perfil é escolhido pela placa de vídeo e **cai sozinho** se o FPS ficar
abaixo de 30 (a escolha fica salva). `?q=high`, `?q=medium` ou `?q=low` na URL forçam um perfil.

Otimizações que valem para todos os perfis: as ~520 peças fixas da casa são juntadas em 72
(≈ 210–260 chamadas de desenho por quadro, antes eram 4.201); a sombra só é recalculada quando o
sol muda ou porta/janela/carro se movem; nenhuma luz pontual projeta sombra; os materiais são
compilados na tela de carregamento. Uma proteção no pós-processamento impede que um pixel
inválido (NaN) se espalhe pelo bloom — era a causa da tela preta quando o alarme disparava.

## Observações

- O plano gratuito do Blynk tem limite de mensagens/requisições. O firmware só publica
  quando um valor muda e o servidor só consulta o Blynk enquanto a página está aberta.
- three.js e as fontes são servidos localmente: a parte visual funciona sem internet.
