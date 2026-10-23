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
