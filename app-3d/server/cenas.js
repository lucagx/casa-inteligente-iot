/*
 * Cenas de um toque (I4): um toque no painel do celular ou na casa 3D dispara vários comandos em sequência.
 *
 * O firmware só aceita comando de atuador no modo manual, então toda cena começa passando para o manual (V3=0).
 * Cada passo é [alvo, valor, espera em ms depois dele]; sem espera, usa o intervalo padrão (dá tempo de o Blynk
 * repassar à placa na ordem certa e de a casa 3D mostrar cada mudança).
 * Alvo "V…" = pino da placa; "luz:sala|cozinha|quarto|externa|todos" = luz de um cômodo (nível 0–100).
 * As luzes dos cômodos comandam o LED do D1 (V0, luz geral): aceso enquanto algum cômodo estiver aceso.
 * Por isso as cenas acendem antes o que fica aceso e só depois apagam o resto (o D1 não pisca no meio).
 * As que deixam luz acesa terminam no MANUAL: no automático o firmware liga/desliga o D1 pela presença e
 * apagaria as luzes da cena. Só a Apresentação, que termina tudo apagado, volta ao automático.
 */
const INTERVALO_MS = 350;
const PASSO_APRESENTACAO_MS = 1500;
const P = PASSO_APRESENTACAO_MS;

const CENAS = {
  cheguei: {
    nome: "Cheguei", icone: "chegar", descricao: "Desarma o alarme, destranca e acende sala, cozinha e luz externa",
    passos: [["V3", 0], ["V9", 0], ["V1", 1], ["luz:sala", 100], ["luz:cozinha", 100], ["luz:externa", 100], ["luz:quarto", 0]],
  },
  // casa vazia: segurança. Só a luz externa fica acesa e a janela é fechada
  sai: {
    nome: "Saí", icone: "sair", descricao: "Só a luz externa acesa; tranca, fecha a janela e arma o alarme",
    passos: [["V3", 0], ["luz:externa", 100], ["luz:sala", 0], ["luz:cozinha", 0], ["luz:quarto", 0], ["V1", 0], ["V2", 0], ["V9", 1]],
  },
  // gente em casa: abajur e externa fracos; a janela fica como está (ventilação da noite)
  dormir: {
    nome: "Dormir", icone: "lua", descricao: "Abajur do quarto a 15 % e externa a 40 %; tranca e arma; janela fica como está",
    passos: [["V3", 0], ["luz:quarto", 15], ["luz:externa", 40], ["luz:sala", 0], ["luz:cozinha", 0], ["V1", 0], ["V9", 1]],
  },
  apresentacao: {
    nome: "Apresentação", icone: "play", descricao: "Tour de ~20 s por todas as luzes e atuadores para a turma ver",
    passos: [
      ["V3", 0], ["luz:sala", 100, P], ["luz:cozinha", 100, P], ["luz:quarto", 100, P], ["luz:externa", 100, P],
      ["V2", 1, P], ["V1", 1, P], ["V9", 1, P], ["V9", 0, P], ["V1", 0, P], ["V2", 0, P],
      ["luz:todos", 0], ["V3", 1],
    ],
  },
};

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// enviar(alvo, valor): aplica um comando (Blynk, simulação ou lâmpada virtual)
// aoMudar(cena|null): cena em andamento mudou (início, cada passo, fim)
// aoTerminar(cena, erro): registro da cena concluída (ou que falhou no meio)
function criarCenas({ enviar, aoMudar, aoTerminar }) {
  let atual = null;

  function executar(id, origem) {
    const c = CENAS[id];
    if (!c) throw Object.assign(new Error(`Cena "${id}" não existe.`), { status: 404 });
    if (atual) throw Object.assign(new Error(`A cena ${atual.nome} ainda está em andamento.`), { status: 409 });
    atual = { id, nome: c.nome, origem, inicio: Date.now(), passo: 0, total: c.passos.length };
    aoMudar({ ...atual });
    // roda em segundo plano: a resposta HTTP volta na hora e o andamento vai pelo stream (state.scene)
    (async () => {
      let erro = null;
      try {
        for (const [i, [alvo, valor, espera = INTERVALO_MS]] of c.passos.entries()) {
          await enviar(alvo, valor);
          atual.passo = i + 1;
          aoMudar({ ...atual });
          if (i < c.passos.length - 1) await esperar(espera);
        }
      } catch (e) {
        erro = e;
      } finally {
        const fim = atual;
        atual = null;
        aoMudar(null);
        aoTerminar?.(fim, erro);
      }
    })();
    return { id, nome: c.nome };
  }

  return {
    executar,
    lista: () => Object.entries(CENAS).map(([id, c]) => ({ id, nome: c.nome, icone: c.icone, descricao: c.descricao })),
  };
}

module.exports = { criarCenas, CENAS };
