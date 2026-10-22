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
