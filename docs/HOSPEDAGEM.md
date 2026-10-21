# Hospedagem no Render

O servidor da casa 3D (`app-3d/`) fica publicado no [Render](https://render.com) para a casa e o painel abrirem
de qualquer lugar (PC da apresentação e celular), sem instalar nada. A placa continua falando só com o Blynk;
o servidor publicado lê e escreve no Blynk pela API externa, igual ao servidor local.

```
NodeMCU ── Wi-Fi ──► Blynk Cloud ◄── HTTP ── Render (app-3d/server.js) ── HTTPS + SSE ──► navegador / celular
```

## Configuração já no repositório

`render.yaml` (raiz) descreve o serviço:

| Item | Valor |
|---|---|
| Tipo / plano | Web Service · Free |
| Região | Virginia (EUA leste — menor latência até o Brasil e perto do Blynk `ny3`) |
| Pasta | `app-3d` (Root Directory) |
| Build / Start | `npm ci` / `node server.js` |
| Health check | `/healthz` (aberto, sem dados). Não usar `/api/state`: com senha ele responde 401 e o deploy nunca fica saudável |
| Deploy automático | a cada push na `main` que mude algo dentro de `app-3d/` |
| Node | 24 (LTS) via `NODE_VERSION`. Para o 26, trocar o valor depois que ele virar LTS (fim de out/2026) e testar |

Variáveis:

| Variável | Onde | Valor |
|---|---|---|
| `NODE_VERSION`, `POLL_INTERVAL_MS`, `PAINEL_USUARIO` | `render.yaml` | `24`, `1200`, `casa` |
| `BLYNK_TOKEN` | painel do Render | token do dispositivo (Blynk.Console → Devices → Device Info) |
| `BLYNK_SERVER` | painel do Render | servidor da região, ex.: `ny3.blynk.cloud` |
| `PAINEL_SENHA` | painel do Render | senha do painel (Basic Auth, usuário `casa`) |
| `DEMO` | opcional | `true` publica em modo demonstração |
| `SENSORES` | opcional | `ldr,garagem` religa os sensores opcionais (vazio = desligados) |

**Sem `PAINEL_SENHA` o servidor se recusa a subir no Render** (o link é público e controla luz, porta e alarme).
O deploy falha com `PAINEL_SENHA não definida no Render` nos logs.

## Primeira publicação

1. Entrar em render.com com a conta do GitHub e autorizar o acesso ao repositório `lucagx/casa-inteligente-iot`.
2. **New → Blueprint** → escolher o repositório. O Render lê o `render.yaml` e pede os valores de `BLYNK_TOKEN`,
   `BLYNK_SERVER` e `PAINEL_SENHA`. Preencher e confirmar (**Apply**).
3. Aguardar o build (~2 min). O endereço fica em `https://casa-inteligente-XXXX.onrender.com` (aparece no topo do serviço
   e nos logs: `Publicado em: …`).
4. Abrir o link → usuário `casa` + a senha → a casa 3D abre e mostra **AO VIVO**.

Sem Blueprint (manual): **New → Web Service** → repositório → Root Directory `app-3d`, Build `npm ci`,
Start `node server.js`, Instance type Free, Health Check Path `/healthz` e as variáveis da tabela acima.

Para testar antes do merge na `main`: em *Settings → Build & Deploy → Branch*, apontar para `m2/hospedagem`
e voltar para `main` depois.

## Banco do histórico (H3)

O disco do Render some a cada deploy e o Postgres grátis do próprio Render expira em 30 dias, então o histórico
(leituras e eventos do IoB) fica num **Postgres grátis do Supabase**. O Neon também funciona, mas o limite de horas
de processamento do plano grátis tende a estourar, porque o servidor grava a cada poucos minutos e não deixa o banco dormir.

1. supabase.com → entrar com o GitHub → **New project**: nome `casa-inteligente`, gerar e guardar a senha do banco,
   região **East US (North Virginia)** (a mesma do Render: grava mais rápido).
2. No projeto: **Connect** → aba *Connection String* → modo **Transaction pooler** (porta 6543; funciona com IPv4,
   que é o que o Render usa). Copiar a URL e trocar `[YOUR-PASSWORD]` pela senha do passo 1.
3. Render → serviço → **Environment** → `DATABASE_URL` = a URL → *Save*. O serviço reinicia e cria as tabelas
   `leituras` e `eventos` sozinho. Nos logs: `Histórico: Postgres (DATABASE_URL)`.
4. Conferir: `https://…onrender.com/api/events?desde=1h` (com a senha) responde `"motor": "postgres"`.
   No Supabase, *Table Editor* mostra as linhas chegando.

Para usar o mesmo banco no PC, colocar a mesma `DATABASE_URL` no `app-3d/.env`. No **modo demonstração o banco
nunca é usado** (fica em memória com 7 dias sintéticos), para dados simulados não se misturarem com os reais.

O Supabase grátis **pausa o projeto após 7 dias sem uso**; com o servidor gravando, isso não acontece. Se pausar,
o servidor continua funcionando, avisa no log e as rotas do histórico respondem 503 até reativar no painel.

Também em `render.yaml`: `TZ=America/Sao_Paulo` (horas do histórico no horário do Brasil) e
`HISTORICO_POLL_MS=60000` (sem página aberta, lê o Blynk a cada 60 s para o histórico não ter buracos, ~43 mil
consultas/mês; `0` desliga). Se o serviço não foi criado pelo Blueprint, adicionar as duas no *Environment*.

## Manter acordado (opcional)

O plano Free **dorme após 15 min sem tráfego** e leva ~1 min para voltar no primeiro acesso.
Um monitor gratuito (ex.: [UptimeRobot](https://uptimerobot.com)) evita isso:

- Tipo HTTP(s), URL `https://…onrender.com/healthz`, intervalo de 10 min.
- `/healthz` não exige senha nem consulta o Blynk, então o monitor **não gasta a cota** do plano grátis do Blynk.
  É ele que mantém o servidor acordado — e portanto gravando o histórico — quando ninguém está com a página aberta.
- 750 h grátis/mês cobrem um serviço ligado o mês todo (31 × 24 = 744 h). Não criar um segundo serviço Free acordado.

Na apresentação: abrir o link uns minutos antes para garantir que está acordado.

## Cuidados

- **Disco não é persistente**: tudo que fica em arquivo some a cada deploy/reinício. Por isso o histórico do IoB
  fica no Postgres externo (seção acima). Sem `DATABASE_URL` ele vive só na memória até o próximo reinício.
- **Cota do Blynk**: o Render e o PC local ao vivo com o mesmo token somam requisições. Com os dois abertos ao mesmo
  tempo, deixar um deles em modo demonstração (`DEMO=true`).
- Só uma placa pode usar o token; vários servidores podem (API externa).
- Segredos ficam só no painel do Render. Nunca colocar token ou senha no `render.yaml` nem no repositório (é público).
- Trocar a senha: *Environment → PAINEL_SENHA → Save*; o Render reinicia o serviço.

## Pronto quando (H2)

- [ ] `https://…onrender.com` pede senha (401 sem login) e abre a casa ao vivo com a senha.
- [ ] Stream em tempo real funciona (ligar a luz no Blynk aparece na casa sem recarregar).
- [ ] Comando pela casa (luz/porta/janela) chega na placa.
- [ ] `/healthz` responde `ok` sem senha; health check verde no Render.
- [ ] Push na `main` dispara deploy automático.
