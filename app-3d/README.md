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
| `PRESENCA_POLL_MS` | Leitura rápida só da presença (V11) com página aberta (padrão 500 ms, mínimo 300; `0` desliga). PIR na tela em < 1 s; custa 1 requisição ao Blynk a cada leitura |
| `DEMO` | `true` força o modo demonstração |
| `SENSORES` | Sensores opcionais presentes: `ldr`, `garagem` (vírgula). Vazio = nenhum |
| `PAINEL_SENHA` / `PAINEL_USUARIO` | Senha do painel (Basic Auth, usuário padrão `casa`). Obrigatória antes de publicar: o link controla luz, porta e alarme. Vazia = aberto (dev). `/healthz` fica sempre aberto, sem dados, para o health check |
| `DATABASE_URL` | Postgres do histórico (Supabase/Neon). Vazio = memória. Ignorado no modo demonstração. Veja "Histórico" abaixo |
| `HISTORICO_POLL_MS` | Consulta de fundo ao Blynk sem página aberta, para o histórico (padrão 60000; `0` desliga) |

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

### Histórico no celular (aba Histórico)

Em `/painel/#historico` (aba embaixo): temperatura e umidade de 24 h ou 7 dias (uPlot, servido localmente em
`/vendor/uplot`), **mapa de calor da presença por hora × dia** dos últimos 7 dias, tempo de **luz geral ligada por
dia** (somado a partir do V0 e do valor `antes` do período) e a **linha do tempo** dos eventos com quem fez
(automático, painel, cena, app/botão, sensor), com filtros. Evento novo chega ao vivo pelo stream (`event: evento`);
temperatura e luz se atualizam a cada 5 min com a aba aberta. Sem banco (503), a aba avisa e a casa segue normal.
No modo demonstração já vem com 7 dias sintéticos.

### Consumo de energia (aba Consumo)

Em `/painel/#consumo`: kWh e R$ de hoje e do mês (com previsão), barra da **meta mensal**, comparação
("você economizou X%" — últimos 7 dias × semana anterior; com menos de 2 semanas de histórico, ontem × média
dos dias anteriores), uma **dica** gerada pelos números (meta, horário de ponta ou quem mais gasta), últimos 7 dias
por cômodo, consumo do mês por cômodo e a simulação da **tarifa branca** (ponta 18h–21h nos dias úteis).

- Cálculo no servidor (`server/consumo.js`, rota `GET /api/consumo`), minuto a minuto a partir do histórico:
  potência do cômodo × nível (0–100 %) × tempo, mais a base fixa (placa e sensores). Os níveis dos cômodos são
  gravados no histórico como leituras **V20 sala, V21 cozinha, V22 quarto, V23 externa**; antes do primeiro
  registro de um cômodo vale a regra da luz geral (V0 ligado ⇒ todos a 100 %).
- Potências de uma casa real equivalente (o protoboard gasta miliwatts): `CONSUMO_W`, `TARIFA_KWH`,
  `TARIFA_BRANCA`, `META_MENSAL_KWH` (ver `.env.example`).
- `CONSUMO_V15=1` publica o consumo do dia no V15 do Blynk a cada 5 min — ligar depois de criar o datastream (K1).
- O carregador do carro (V3) entra no total, nos 7 dias, por cômodo e na tarifa branca; a dica avisa quando o carro
  carregou entre 17h e 22h em dia útil e quanto custaria com "Só fora de ponta".

### Carro elétrico e carregador (V3)

O HC-SR04 saiu do protoboard, então o carro virou parte do IoB de consumo: um **carregador virtual** (não existe
na placa nem no Blynk ainda) que vive no servidor (`server/carregador.js`, `state.carro`), como as luzes por cômodo.

- Só carrega com o carro na garagem. A bateria sobe com a energia que entra: `CARREGADOR_KW` (padrão 2,2 kW,
  carregador portátil) ÷ `BATERIA_KWH` (padrão 40 kWh) ≈ 5,5 % por hora; para sozinho em 100 %.
- **Só fora de ponta:** com o carregador ligado, espera as 22h nos dias úteis (o fim de semana inteiro é fora de ponta).
- Cenas: **Cheguei** começa com o carro entrando na garagem (o cabo conecta); **Saí** termina com o carro saindo
  (a carga para). Ao voltar, a bateria está mais baixa (3 % + 1 % por hora fora, no máximo 25 %).
- Histórico: **V24** carregando (0/1), **V25** bateria (%), **V26** carro na garagem; eventos `carregador`
  (carregando, parado, aguardando fora de ponta) e `carro` (chegou, saiu). Ao reiniciar, o estado volta do histórico.
- Casa 3D: wallbox na parede leste da garagem com tela da bateria e LED (azul conectado, âmbar aguardando,
  verde pulsando carregando), cabo até a porta de carga do carro e hotspot. Painel do celular: bloco "Carro elétrico".
- API: `POST /api/carregador {"ligado":true}` ou `{"foraDePonta":true}` (opcional `"origem":"painel"|"casa3d"`).
- **Modelo 3D do carro (opcional):** coloque um carro em glTF binário em `public/modelos/carro.glb` e a casa 3D usa ele no
  lugar do carro gerado em código (o servidor avisa em `/js/config.js`, `MODELOS.carro`). Escala, centro e altura são
  ajustados sozinhos (comprimento de ~4,5 m); vidros (nomes com glass/window/vidro ou material transparente) viram vidro
  preto transparente; nós com wheel/tire/rim/roda/pneu no nome giram quando o carro anda. Se a frente vier ao contrário,
  `?carroGiro=180`. Use um modelo com licença livre (ex.: CC-BY no Sketchfab, com o crédito aqui no README) e prefira
  arquivos de até ~10 MB (o Render serve o arquivo a cada visita).

### Privacidade e consentimento (ética do IoB)

Uma casa que aprende com o comportamento de quem mora nela precisa ser transparente. Em `/painel/#privacidade`
(botão **Privacidade** no topo do painel), no espírito da LGPD (Lei 13.709/2018 — finalidade, necessidade,
transparência, acesso e eliminação):

| Dado | Para quê |
|---|---|
| Movimento no PIR (só "houve movimento" e a hora, sem identificar quem) | presença, rotina, modo ausente, alarme |
| Temperatura e umidade (1 amostra a cada 5 min) | gráficos e conforto da janela |
| Luzes, porta, janela, alarme e modo (cada mudança, com a origem) | linha do tempo e consumo |
| Carro e carregador (na garagem, carregando, bateria) | consumo e tarifa branca |
| Escolhas do morador (rotinas, modo ausente, limite da janela) | fazer a casa agir como ele pediu |
| **Não é coletado:** imagem, som, localização, nomes, contatos, dados de outros aparelhos | — |

- **Quem acessa:** quem tem a senha do painel; os sensores passam pelo Blynk Cloud; o histórico fica no banco do projeto
  (Supabase) ou só na memória do servidor. Nada é vendido nem repassado.
- **Consentimento:** no primeiro acesso a aba Casa mostra o aviso ("Concordo" / "Ver detalhes"); o registro (data e hora)
  fica na tabela `config` e vira evento `privacidade` no histórico.
- **Pausar a coleta:** a casa continua funcionando (controles, cenas, regras do firmware), mas nada novo é gravado e a
  rotina/conforto deixam de aprender. Ao retomar, o estado atual vira o ponto de partida dos gráficos.
- **Retenção:** 7, 30 ou 90 dias (padrão 90; o que passar disso é apagado na hora e todo dia).
- **Acesso e eliminação:** "Baixar meus dados" (`GET /api/privacidade/exportar`, JSON com leituras e eventos) e
  "Apagar todo o histórico" (`POST /api/privacidade/apagar {"confirmar":"APAGAR"}`; fica só o registro de que foi apagado).
- API: `GET /api/privacidade`, `POST /api/privacidade {"consentir":true}` · `{"pausado":true}` · `{"retencaoDias":30}`;
  o stream traz `state.privacidade`.

### Insights do dia e alertas (aba IoB e aba Casa)

- **Hoje na casa** (`GET /api/insights?dia=hoje|ontem|data`, `server/insights.js`): detecções e pico de presença por hora,
  tempo de luz geral ligada, janela aberta N× (quantas pela regra do calor e quantas na mão), disparos do alarme e energia
  do dia (I3, com a parte do carro), comparados com a média dos 7 dias anteriores (no dia em andamento, proporcional às
  horas que já passaram), mais frases curtas que contam o dia.
- **Alertas** (avaliados a cada 5 s, `state.alertas` no stream): porta destrancada há mais de 10 min (Trancar), movimento
  com o alarme armado (Desarmar — fica até alguém ver, mesmo depois dos 4 s do buzzer), ≥ 30 °C com a janela fechada no
  manual há 2 min (Abrir a janela), NodeMCU offline há 2 min (ao vivo) e carro com menos de 20 % sem carregar (Carregar).
  Aparecem no topo da aba Casa e no feed da casa 3D; "Ok, já vi" silencia até a condição acabar. Cada alerta novo vira
  evento `alerta` no histórico. API: `POST /api/alertas/:id {"resposta":"executar"|"ok"}`.
- **Avisos no celular:** com permissão, cada alerta novo vira notificação do sistema pelo service worker (com o painel em
  segundo plano; no iPhone só com o app instalado). O push pelo Blynk (eventos e notificações) fica para a K3.

### Rotina aprendida e modo ausente (aba IoB)

Em `/painel/#rotina` (aba **IoB**) a casa devolve o que aprendeu do histórico (`server/rotina.js`, recalculado a cada 30 min):

- **Saída e chegada típicas** por dia da semana (mediana): pelos eventos do carro (V3) e, sem eles, pelo maior
  intervalo sem presença no PIR durante o dia (≥ 3 h).
- **Sugestões** que viram rotinas com um toque: acender a luz externa 10 min antes da chegada típica (só se a casa
  estiver vazia) e armar o alarme 15 min depois da saída típica (só se o PIR não viu ninguém por 15 min). Sem presença
  há 2 h: "armar o alarme agora?" e "ligar o modo ausente?" — essas aparecem também no topo da aba Casa.
  "Agora não" esconde a sugestão por 7 dias (as de agora, por 3 h).
- **Modo ausente** (anti-furto): acende e apaga os cômodos nas horas em que costumam ficar acesos (≥ 35 % do tempo,
  padrão por hora dos últimos 14 dias), com alguns minutos de diferença por cômodo e por dia. O tempo em modo ausente
  não entra no aprendizado. Desliga sozinho na cena Cheguei.
- Escolhas (rotinas, dispensadas, modo ausente) ficam na tabela `config` do banco (memória no modo demonstração).
  Cada disparo vai para o histórico como evento `rotina` (origem `rotina`); o modo ausente como evento `ausente`.
- API: `GET /api/rotina`, `POST /api/rotina/sugestao {"id":"luz-chegada","aceitar":true}`,
  `DELETE /api/rotina/automacao/:id`, `POST /api/ausente {"ligado":true}`. O stream traz `state.iob`
  (sugestões e modo ausente).

### Conforto adaptativo da janela (aba IoB)

Cada vez que alguém abre ou fecha a janela **na mão** (painel, casa 3D, app/botão), a temperatura daquele momento
vira uma pista do conforto da pessoa (`server/conforto.js`). Os limites aprendidos são médias móveis exponenciais
(cada ajuste novo pesa 35 %), partindo dos do firmware (abre ≥ 30 °C, fecha ≤ 27 °C), com pelo menos 1,5 °C entre
eles. Aberturas automáticas, de cena e do próprio conforto não contam.

- O painel mostra "abre a partir de 28,8 °C · fecha abaixo de 26,5 °C" ao lado dos limites do firmware e os últimos ajustes.
- **Aplicar no modo manual:** com a casa no manual, o servidor abre/fecha a janela pelos limites aprendidos
  (origem `conforto`, espera 10 min depois de qualquer mudança da janela). No automático a placa segue o firmware (30/27 °C)
  — o firmware não foi alterado.
- `CONFORTO_V17=1` (modo ao vivo) publica o limite de abrir no V17 do Blynk para quando o firmware passar a lê-lo
  (precisa do datastream V17 — junto com a K1).
- API: `GET /api/conforto`, `POST /api/conforto {"aplicar":true}`; o stream traz `state.conforto`.

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

**Luz externa à noite (V2):** o cômodo "externa" acende o jardim inteiro — spots do beiral, balizadores do caminho
com halo e círculo de luz no chão, spot no pé de cada árvore, luz rasante na fachada da entrada, fita de LED sob o
deck e a piscina com brilho ciano nas paredes e cáusticas animadas no fundo (de dia as cáusticas vêm do sol).
Tudo é emissivo ou brilho aditivo (nenhuma luz nova); os brilhos ficam fora do AO do perfil alto (`userData.semAO`).

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

## Histórico (API para o painel IoB)

O servidor guarda leituras e eventos (`server/history.js`): em um Postgres externo com `DATABASE_URL`,
senão em memória. No modo demonstração é sempre memória, já com **7 dias sintéticos** (mesmas regras do
firmware + uma rotina de casa), para os gráficos terem dados sem a placa. Testes: `npm test`.

- **Leituras:** cada pino só quando muda; V4/V5 uma amostra a cada 5 min.
- **Eventos:** `luz` (ligada/desligada), `porta` (destrancada/trancada), `janela` (aberta/fechada),
  `modo` (automatico/manual), `alarme` (armado/desarmado/disparado), `presenca` (detectada), `placa` (online/offline),
  `cena` (nome da cena, ex. `Saí`; `Saí (falhou)` se parou no meio — origem = onde foi tocada: `painel`, `casa3d` ou `blynk`).
- **Origem:** `painel` (comando pelo `/api/command` ou cômodo pelo `/api/room`), `cena` (mudanças feitas por uma cena), `automatico` (regra do firmware),
  `dispositivo` (app do Blynk ou botão), `sensor` (PIR/buzzer), `sistema`.
- Guarda 90 dias. Período em `desde`/`ate`: `30m`, `24h`, `7d`, data ISO ou milissegundos.

`GET /api/history?desde=24h&ate=&pinos=V4,V5` (sem `pinos` = todos)

```json
{ "motor": "postgres", "desde": 1792360000000, "ate": 1792446400000,
  "pinos": { "V4": [[1792360200000, 24.8], …], "V5": [[1792360200000, 61], …] },
  "antes": { "V4": [1792359900000, 24.6] } }
```

Cada ponto é `[ts em ms, valor]` (número quando dá, senão texto, ex.: `"ABERTA"`). `antes` é o último valor
de cada pino antes de `desde` — o estado inicial para somar tempo de luz ligada, por exemplo.

`GET /api/events?desde=7d&tipo=presenca,luz&limite=200` (padrão: 7 dias, todos os tipos, 200; máximo 1000)

```json
{ "motor": "memoria", "desde": …, "ate": …,
  "eventos": [{ "ts": 1792446000000, "tipo": "luz", "origem": "automatico", "detalhe": "ligada" }, …] }
```

Eventos vêm do mais novo ao mais antigo. Ao vivo, cada evento novo também chega pelo `/api/stream`
como `event: evento` (mesmo formato). Banco fora do ar → 503 nas duas rotas; a casa continua funcionando
e a fila é gravada quando o banco volta. As cenas (I4) já registram: cada comando delas passa por
`comandar(pino, valor, "cena")` no `server.js` (que chama `historico.comando`) e a cena em si vira um evento `cena`.

## Observações

- O plano gratuito do Blynk tem limite de mensagens/requisições. O firmware só publica
  quando um valor muda e o servidor só consulta o Blynk no ritmo rápido enquanto a página está aberta;
  sem página, uma consulta a cada `HISTORICO_POLL_MS` (60 s) mantém o histórico (`0` desliga).
  Com página aberta, a presença tem leitura própria (`PRESENCA_POLL_MS`): ~2 requisições/s a mais. Se a cota
  apertar, subir para 1000 ou usar `0` (a presença volta a chegar junto com a leitura geral).
- Depois de um comando, a leitura do Blynk daquele pino é ignorada por até 3 s até a placa confirmar
  (o servo leva ~0,7 s; antes a tela mostrava a janela abrindo e voltando a fechada). Se a placa recusar
  o comando (ex.: estava no automático), depois do prazo vale o valor real.
- Presença na tela: "N detecções hoje · última há X s" (a última vem do histórico ao reiniciar) e o
  holograma da entrada fica no mínimo 3 s a cada detecção, mesmo num pulso curto do PIR.
- three.js e as fontes são servidos localmente: a parte visual funciona sem internet.
