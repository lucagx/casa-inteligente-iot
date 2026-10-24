# Blynk — configuração do Console

Passo a passo do que é feito à mão no Blynk.Console e no app (K1, K2, K3), e do que o servidor faz com cada pino.
Conta usada: plano **Free** (5 dispositivos, 1 usuário, 100 mil mensagens/mês, 5 automações por organização,
20 datastreams por template).

## K1 — Datastreams

**Onde:** Blynk.Console → **Developer Zone** → **My Templates** → template da casa → **Edit** → aba **Datastreams**
→ **+ New Datastream** → **Virtual Pin**. Ao terminar, **Save** (canto superior direito) — sem salvar o template,
nada vale.

Em 21/10/2026 existiam 12 datastreams (V0–V11). A lista final tem **20** (o limite do plano):

| Pino | Nome | Tipo | Unidade | Mín | Máx | Casas | Quem escreve | Situação |
|---|---|---|---|---|---|---|---|---|
| V0 | Luz geral (D1) | Integer | — | 0 | 1 | — | placa / app | manter |
| V1 | Porta destrancada (D0) | Integer | — | 0 | 1 | — | placa / app | manter |
| V2 | Janela (comando, D7) | Integer | — | 0 | 1 | — | app | manter |
| V3 | Modo automático | Integer | — | 0 | 1 | — | placa / app | manter |
| V4 | Temperatura | Double | °C | 0 | 50 | 1 (#.#) | placa | manter, ajustar unidade |
| V5 | Umidade | Integer | % | 0 | 100 | — | placa | manter, ajustar unidade |
| V6 | Claro/escuro (LDR) | String | — | — | — | — | placa (desativado) | manter |
| V7 | Status da janela | String | — | — | — | — | placa | manter |
| V8 | Status do alarme | String | — | — | — | — | placa | manter |
| V9 | Alarme armado (botão D6) | Integer | — | 0 | 1 | — | placa / app | manter |
| V10 | Luminosidade (LDR) | Integer | % | 0 | 100 | — | placa (desativado) | manter |
| V11 | Presença (PIR D5) | Integer | — | 0 | 1 | — | placa | manter |
| **V12** | Distância do carro (HC-SR04) | Integer | cm | 0 | 400 | — | placa (desativado) | **criar** |
| **V13** | Terminal | String | — | — | — | — | servidor | **criar** |
| **V14** | Detecções hoje | Integer | — | 0 | 9999 | — | placa | **criar** |
| **V15** | Consumo hoje | Double | kWh | 0 | 100 | 2 (#.##) | servidor | **criar** |
| **V16** | Cena | Integer | — | 0 | 4 | — | servidor / app | **criar** |
| **V18** | Carregador do carro | Integer | — | 0 | 1 | — | servidor / app | **criar** |
| **V23** | Luz externa | Integer | % | 0 | 100 | — | servidor / app | **criar** |
| **V25** | Bateria do carro | Integer | % | 0 | 100 | — | servidor | **criar** |

Se o Console deixar criar mais que 20, os próximos seriam **V17** Limite da janela (Double, °C, 20–40, 1 casa) e
**V26** Carro na garagem (Integer 0/1). Hoje eles só existem no histórico do servidor.

### Passo a passo

1. Nos datastreams que já existem, abra cada um (lápis) e ajuste **nome** e **unidade** como na tabela. Não precisa
   trocar o tipo de dado; se o V4 estiver como Integer, pode deixar (o DHT11 mede de 1 em 1 °C).
2. Crie os 8 novos (V12, V13, V14, V15, V16, V18, V23, V25) com tipo, unidade, mín/máx e casas da tabela.
   No V13 (Terminal), tipo **String**. Nos demais, deixe o valor padrão em 0.
3. **Save** no template.
4. Reinicie o servidor para ele enxergar os pinos novos (ele descarta, ao iniciar, os pinos que não respondem):
   - Render: painel do serviço → **Manual Deploy → Restart service** (ou o próximo deploy);
   - no PC: parar e iniciar de novo a tarefa **Casa 3D: iniciar**.
5. Variável `CONSUMO_V15=1` (publica o consumo do dia no V15 a cada 5 min): já está no `render.yaml`; no PC, no `.env`.

### LDR e HC-SR04 desativados

V6, V10 e V12 ficam no template para o futuro, mas sem widget no dashboard. Quem desliga é o código:
`USAR_LDR 0` e `USAR_HCSR04 0` no firmware e `SENSORES=` vazio no `.env` do servidor. Para religar, trocar as flags
(firmware) e `SENSORES=ldr,garagem` (servidor) — os datastreams já estarão lá.

### O que o servidor faz com os pinos novos (`app-3d/server/blynk.js`)

Só no modo ao vivo (com `BLYNK_TOKEN`); o modo demonstração não fala com o Blynk.

- **V16 Cena:** quando uma cena roda (pelo celular, casa 3D ou Blynk), o V16 mostra o número dela e volta a 0 no fim.
  Escolher 1 Cheguei, 2 Saí, 3 Dormir ou 4 Apresentação no app do Blynk (ou numa automação) **roda a cena**.
- **V18 Carregador:** espelha o carregador do carro (ligado/desligado); mudar no Blynk liga/desliga o carregador.
- **V23 Luz externa:** nível da luz externa (0–100 %); mudar no Blynk acende a externa (e o D1, pela regra da luz geral).
- **V25 Bateria:** porcentagem da bateria do carro (só leitura).
- **V15 Consumo hoje:** kWh do dia, a cada 5 min (`CONSUMO_V15=1`).
- Cada valor só é enviado quando muda (1 envio = 1 mensagem da cota). No histórico, o que vier do Blynk aparece com
  origem "Blynk".
- Um pino que ainda não existe no Console só gera um aviso no log (`[blynk] V25: ... o datastream existe no Console?`)
  e o servidor tenta de novo a cada 10 min.
- As mudanças feitas no Blynk chegam ao servidor na próxima leitura: em ~1 s com alguém com a página aberta, ou em até
  60 s sem ninguém (`HISTORICO_POLL_MS`). Com o Render dormindo (15 min sem acesso), só quando ele acordar.

**Cota:** os envios novos ficam abaixo de ~9 mil por mês no pior caso (consumo no máximo a cada 5 min e só quando
muda, bateria ~1 por 10 min enquanto carrega, cenas e externa quando mudam). Em 21/10 a conta estava com 5,9 mil de
100 mil usados.

## K2 — Dashboard web e app do celular

Os dois mostram a mesma casa, com o mesmo layout em quatro faixas: **agora**, **controles**, **energia e carro**,
**histórico e log**. LDR e HC-SR04 (V6, V10, V12) ficam sem widget.

Antes de começar, uma regra do firmware que aparece no dashboard: com o **modo automático ligado (V3 = 1)**, a placa
ignora os comandos de luz, porta e janela (o switch volta sozinho). O painel do celular e a casa 3D trocam para o
manual sozinhos; no Blynk, desligue o automático antes de mexer nos atuadores.

### Web (Blynk.Console)

**Onde:** Developer Zone → My Templates → template da casa → **Edit** → aba **Web Dashboard**. Arraste os widgets da
lista à esquerda, clique na engrenagem de cada um para escolher o datastream e o título, e **Save** no fim.
Se algum widget aparecer com cadeado (pago no plano Free), use o alternativo indicado.

| Faixa | Widget | Datastream | Título e ajustes |
|---|---|---|---|
| 1 · Agora | Gauge | V4 | Temperatura · 0–50 °C |
| 1 · Agora | Gauge | V5 | Umidade · 0–100 % |
| 1 · Agora | LED | V11 | Presença · cor verde |
| 1 · Agora | Label | V14 | Detecções hoje |
| 1 · Agora | Label | V8 | Alarme (mostra DESARMADO / ARMADO / ALARME ATIVO) |
| 2 · Controles | Switch | V3 | Modo automático · rótulos ON "Auto", OFF "Manual" |
| 2 · Controles | Switch | V0 | Luz geral (D1) |
| 2 · Controles | Switch | V1 | Porta · ON "Destrancada", OFF "Trancada" |
| 2 · Controles | Switch | V2 | Janela · ON "Abrir", OFF "Fechar" |
| 2 · Controles | Label | V7 | Status da janela |
| 2 · Controles | Switch | V9 | Alarme armado |
| 2 · Controles | Menu (alternativo: Slider 0–4) | V16 | Cena · itens na ordem: "—", "Cheguei", "Saí", "Dormir", "Apresentação" |
| 2 · Controles | Slider | V23 | Luz externa · 0–100 %, passo 10 |
| 3 · Energia e carro | Switch | V18 | Carregador do carro |
| 3 · Energia e carro | Gauge | V25 | Bateria do carro · 0–100 % |
| 3 · Energia e carro | Label | V15 | Consumo hoje · kWh |
| 4 · Histórico | Chart | V4 e V5 | Temperatura e umidade · períodos 1h, 1d, 1w (o Free guarda 1 semana) |
| 4 · Histórico | Chart | V11 | Presença · tipo barra |
| 4 · Histórico | Terminal | V13 | Log da casa · largura total (fica vazio até a F3) |

No Menu, o primeiro item corresponde ao valor 0, o segundo ao 1, e assim por diante — a ordem precisa ser exatamente
essa para bater com o servidor (`server/blynk.js`).

### App do celular (Blynk IoT)

**Onde:** app Blynk IoT → Developer Mode ligado (perfil) → abra o dispositivo → **chave inglesa** (editar o dashboard
do template) → **+** para adicionar widgets. Toque em cada widget para escolher o datastream. Tudo que for configurado
aqui vale para o template, não só para este celular.

| Faixa | Widget | Datastream | Ajustes |
|---|---|---|---|
| 1 | Gauge (×2) | V4, V5 | Temperatura °C, umidade % |
| 1 | LED | V11 | Presença |
| 1 | Value Display | V14 | Detecções hoje |
| 1 | Value Display | V8 | Alarme |
| 2 | Segmented Switch | V3 | Dois segmentos: "Manual" (0) e "Auto" (1) |
| 2 | Button, modo **Switch** (×4) | V0, V1, V2, V9 | Luz, Porta, Janela, Alarme |
| 2 | Value Display | V7 | Janela (ABERTA/FECHADA) |
| 2 | Menu | V16 | Mesmos itens e ordem do web |
| 2 | Slider | V23 | Luz externa 0–100, passo 10 |
| 3 | Button, modo Switch | V18 | Carregador |
| 3 | Gauge | V25 | Bateria % |
| 3 | Value Display | V15 | Consumo hoje kWh |
| 4 | SuperChart | V4 + V5 | Períodos 1h, 1d, 1w |
| 4 | SuperChart | V11 | Presença, barras |
| 4 | Terminal | V13 | Log |

### Capturas para o relatório (E1)

Com a placa ligada e o servidor ao vivo, capture o dashboard web inteiro e o app do celular (uma tela de controles e
uma de histórico). Salve em `docs/capturas/blynk/` como `web-dashboard.png`, `app-controles.png` e `app-historico.png`.

## K3 — Eventos e automações

### Eventos (push no celular)

O servidor manda os alertas do painel IoB (I7) para o Blynk como **eventos** — aparecem na linha do tempo do
dispositivo e chegam como notificação no app. Não depende do firmware: o servidor chama a API HTTP do Blynk
(`/external/api/logEvent`) quando um alerta novo aparece (`server/blynk.js`).

**Onde:** Developer Zone → My Templates → template da casa → **Edit** → aba **Events & Notifications** →
**+ Add New Event**. O **Event Code** precisa ser exatamente o da tabela (é o que o servidor manda).

| Nome | Event Code | Tipo | Quando o servidor manda |
|---|---|---|---|
| Invasão | `invasao` | Critical | movimento com o alarme armado — **sai da placa** (firmware 1.3.0), não do servidor |
| Porta destrancada | `porta_aberta` | Warning | porta destrancada há mais de 10 min |
| Calor com a janela fechada | `calor_janela` | Warning | ≥ 30 °C com a janela fechada no manual, há 2 min |
| Bateria baixa | `bateria_baixa` | Info | carro na garagem com menos de 20 %, sem carregar |
| Resumo do dia | `resumo_diario` | Info | às 21h, com as frases dos insights do dia |

Em cada evento, na aba **Notifications**: ligue **Enable notifications** e marque **Push** para o **Device Owner**
(e-mail é opcional). Sem a notificação ligada o Blynk recusa o evento enviado pela API.

**Placa offline:** não precisa criar evento. Na mesma aba existe o evento embutido **Offline** — ligue as
notificações dele (push) e um atraso de 2 min, para não avisar a cada queda rápida do Wi-Fi.

Limites: o Blynk aceita 100 eventos por dia por dispositivo; o servidor para em 90 e não repete o mesmo evento em
menos de 15 min, e cada alerta é mandado uma vez, até a condição acabar. A placa manda no máximo um push de invasão
por minuto.

**Testar a invasão (placa com o firmware 1.3.0, funciona com o servidor desligado):** arme o alarme (botão ou
dashboard) e passe a mão no PIR — o buzzer toca, o push "Invasão" chega no celular e aparece na linha do tempo do
dispositivo no Console. **Testar os outros (servidor ao vivo):** destranque a porta e espere 10 min, ou veja o log do
servidor, que mostra `[blynk] evento porta_aberta: ...` se o Blynk recusar.

### Automações (5 no plano Free)

**Antes:** em **Datastreams**, abra V9, V18 e V23 → **Automations** → **Use as Action** ligado e **Appears as**:
V9 e V18 = **Switch**; V23 = **Range** (mín 0, máx 100) — com "Value" o datastream é só leitura e não dá para
escolher um número. Depois **Save And Apply** no template. (A tela "Automation Templates" do template é do plano
Enterprise e não é esta.)

**Onde:** menu principal do Console (fora do template) → **Automations** → **+ Create Automation**. Em "When" escolha
horário, fuso America/Sao_Paulo e a repetição; em "Do this", **Control Device** → Mini Casa Inteligente → marque só a
propriedade da tabela e defina o valor. Em "Quando" também existe o gatilho de **pôr do sol** (a automação 2 usa ele; o Console mostra o horário da próxima execução, ex.: 18:10).

| # | Nome | Quando | Repetir | Propriedade | Valor | Depende do servidor? |
|---|---|---|---|---|---|---|
| 1 | Armar o alarme | 23:00 | Diárias | Alarme Armado (V9) | ligado | não (a placa aplica) |
| 2 | Luz externa ao anoitecer | pôr do sol | Diárias | Luz Externa (V23) | 60 | sim |
| 3 | Apagar a luz externa | 00:30 | Diárias | Luz Externa (V23) | 0 | sim |
| 4 | Carregar fora de ponta | 22:00 | Semanal, seg a sex | Carregador Do Carro (V18) | ligado | sim |

Sobra uma automação livre. As que dependem do servidor só agem quando ele lê o Blynk (em até 60 s; com o Render
dormindo, quando ele acordar). Para mantê-lo acordado, um monitor gratuito (UptimeRobot) chamando `/healthz` a cada
10 min — ver `docs/HOSPEDAGEM.md`.

A luz externa acende pelo servidor e, pela regra da luz geral, também acende o LED do D1 na placa. Se o modo
automático estiver ligado, o servidor troca para o manual antes (senão o firmware apagaria o D1 sem presença).

## F3 — Terminal (V13), parte do servidor

O widget **Terminal** (V13, "Log da casa") recebe do servidor uma linha por evento do histórico, com hora e origem:

```
20:14 luz ligada (painel)
20:15 janela aberta (automático)
20:31 cena Saí (Blynk)
```

- Só no modo ao vivo; origens: painel, cena, automático, app/botão, sensor, sistema, casa 3D, Blynk.
- Presença: no máximo uma linha por minuto (o PIR repete). Fila de 50 linhas, enviadas em ordem.
- Cada linha gasta 1 mensagem da cota (uma centena por dia no uso normal).
- Sem o datastream V13 no Console, o servidor avisa uma vez no log e tenta de novo em 10 min.
- **Quem escreve o quê (sem linhas duplicadas):** a placa (firmware 1.3.0, `logTerminal()`) escreve a regra
  automática de luz e janela (origem "auto"), o alarme (botão, comando do Blynk, disparo) e manda o push da invasão
  (`Blynk.logEvent`). O servidor escreve o resto (comandos do painel, cenas, porta, modo, carro, presença, sistema) e
  não repete as linhas da placa.
- Com a placa ainda no firmware 1.2.0, essas linhas da placa não aparecem no Terminal e o push da invasão não sai.

### Gravar o firmware 1.3.0 (antes de 21/11, enquanto a placa está com você)

1. Tarefa **ESP8266: compilar** — precisa terminar sem erro (o `secrets.h` tem de existir).
2. Tarefa **ESP8266: gravar pela USB** (ou pelo Wi-Fi/Blynk.Air, subindo `BLYNK_FIRMWARE_VERSION`, já em "1.3.0").
3. Monitor serial: `firmware 1.3.0 (LDR desligado, HC-SR04 desligado)` e `[BLYNK] conectado`.
4. Testes na placa (vale anotar com capturas para o relatório):
   - passe a mão no PIR com o modo automático ligado: a luz acende e o Terminal mostra `luz ligada (auto)`;
   - aperte o botão do D6: `alarme armado (botao)`; passe a mão: buzzer, push "Invasão" e `ALARME disparado (sensor)`;
   - aqueça o DHT11 até 30 °C (ou use o dedo): `janela aberta (calor) (auto)`;
   - com o modo manual, mande um comando pelo dashboard: sem linha da placa (o servidor registra, se estiver ligado).
5. Se algo der errado, grave de novo a 1.2.0 (`git show 91c6155:firmware/casa_inteligente/casa_inteligente.ino`).
