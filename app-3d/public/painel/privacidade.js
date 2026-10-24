// Privacidade e consentimento (I8): o que a casa guarda, por quanto tempo, quem vê — e os controles do morador
// (consentir, pausar a coleta, retenção, exportar e apagar). Rotas /api/privacidade no server.js.
const $ = (s) => document.querySelector(s);

export function criarPrivacidade({ toast }) {
  let aberto = false,
    dados = null,
    ultimo = null;

  async function enviar(corpo, msg) {
    try {
      const r = await fetch("/api/privacidade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
      if (msg) toast(msg);
      if (aberto) carregar();
    } catch (e) {
      toast(`Não foi possível: ${e.message}`, "err");
    }
  }

  // ---------- aviso de consentimento (aba Casa) ----------
  $("#consCasa").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-cons]");
    if (!b) return;
    if (b.dataset.cons === "sim")
      enviar(
        { consentir: true },
        "Obrigado — você pode mudar isso em Privacidade",
      );
    else location.hash = "#privacidade";
  });

  // ---------- controles ----------
  $("#dev-coleta").addEventListener("click", () => {
    const pausar = !dados?.pausado;
    enviar(
      { pausado: pausar },
      pausar ? "Coleta pausada: nada novo é guardado" : "Coleta retomada",
    );
  });
  $("#pvRet").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-dias]");
    if (b)
      enviar(
        { retencaoDias: Number(b.dataset.dias) },
        `Histórico guardado por ${b.dataset.dias} dias`,
      );
  });
  $("#pvConsentir").addEventListener("click", () =>
    enviar({ consentir: true }, "Consentimento registrado"),
  );
  $("#pvApagar").addEventListener("click", async () => {
    const txt = prompt(
      "Isto apaga TODO o histórico (leituras e eventos) e não tem volta.\nDigite APAGAR para confirmar:",
    );
    if (txt === null) return;
    if (txt.trim().toUpperCase() !== "APAGAR")
      return toast("Nada foi apagado (confirmação diferente de APAGAR)");
    try {
      const r = await fetch("/api/privacidade/apagar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmar: "APAGAR" }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
      toast("Histórico apagado");
      carregar();
    } catch (e) {
      toast(`Não foi possível apagar: ${e.message}`, "err");
    }
  });

  function render() {
    const d = dados;
    const el = $("#dev-coleta");
    el.classList.toggle("on", !d.pausado);
    el.setAttribute("aria-pressed", d.pausado ? "false" : "true");
    $("#st-dev-coleta").textContent = d.pausado
      ? "Pausada — a casa funciona, mas não aprende nem guarda nada novo"
      : "Ligada";
    document
      .querySelectorAll("#pvRet button")
      .forEach((b) =>
        b.classList.toggle("on", Number(b.dataset.dias) === d.retencaoDias),
      );
    const c = d.contagem;
    $("#pvGuardado").textContent = c
      ? `Guardado agora: ${c.leituras.toLocaleString("pt-BR")} leituras e ${c.eventos.toLocaleString("pt-BR")} eventos` +
        (c.desde
          ? `, desde ${new Date(c.desde).toLocaleDateString("pt-BR")}`
          : "") +
        `. Onde: ${d.descricao}.`
      : `Onde: ${d.descricao}.`;
    $("#pvConsTxt").textContent = d.consentimento
      ? `Consentimento registrado em ${new Date(d.consentimento.ts).toLocaleString("pt-BR")}.`
      : "Ainda sem consentimento registrado.";
    $("#pvConsentir").hidden = !!d.consentimento;
  }

  async function carregar() {
    try {
      const r = await fetch("/api/privacidade", { cache: "no-store" });
      dados = await r.json();
      if (!r.ok) throw new Error(dados.error || `HTTP ${r.status}`);
      render();
    } catch (e) {
      toast(`Privacidade indisponível: ${e.message}`, "err");
    }
  }

  return {
    abrir() {
      aberto = true;
      carregar();
    },
    fechar() {
      aberto = false;
    },
    // a cada estado do stream: aviso de consentimento e faixa de "coleta pausada" na aba Casa
    estado(p) {
      if (!p) return;
      const sig = JSON.stringify(p);
      if (sig === ultimo) return;
      ultimo = sig;
      $("#consCasa").hidden = !!p.consentimento;
      $("#pausaCasa").hidden = !p.pausado;
      if (aberto) carregar();
    },
  };
}
