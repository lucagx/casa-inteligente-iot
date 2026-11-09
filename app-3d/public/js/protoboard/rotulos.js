// Rótulos (CSS2D), cartão de detalhe, legenda e controles. O CSS é injetado uma vez, com prefixo pb-,
// para não depender nem mexer no CSS da casa ou da apresentação.
import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { SISTEMAS } from "./dados.js";

const CSS = `
.pb-raiz{position:absolute;inset:0;overflow:hidden;background:#070b12;color:#eaf1f8;border-radius:inherit;
  font-family:'JetBrains Mono',ui-monospace,Consolas,monospace;-webkit-tap-highlight-color:transparent}
.pb-raiz canvas{display:block;width:100%;height:100%;touch-action:pan-y;outline:none}
.pb-raiz.sobre-peca canvas{cursor:pointer}
.pb-camada{position:absolute;inset:0;pointer-events:none}
.pb-alvo{pointer-events:none}
.pb-rotulo{all:unset;box-sizing:border-box;pointer-events:auto;display:flex;align-items:center;gap:7px;
  padding:5px 9px 5px 7px;border-radius:7px;background:rgba(9,14,23,.86);border:1px solid rgba(255,255,255,.1);
  font:600 11px/1.15 'JetBrains Mono',ui-monospace,Consolas,monospace;color:#eaf1f8;white-space:nowrap;cursor:pointer;
  transition:opacity .35s,border-color .25s,box-shadow .25s;letter-spacing:.01em}
.pb-rotulo i{flex:none;width:7px;height:7px;border-radius:50%;background:var(--c);box-shadow:0 0 8px var(--c)}
.pb-rotulo small{font-weight:400;font-size:10px;color:#93a4b8}
.pb-rotulo:focus-visible{outline:2px solid #5ee7ff;outline-offset:2px}
.pb-rotulo.ativo{border-color:var(--c);box-shadow:0 0 0 1px var(--c),0 0 22px -6px var(--c)}
.pb-raiz.tem-destaque .pb-rotulo:not(.ativo){opacity:.28}
.pb-nota{font:400 9.5px/1 'JetBrains Mono',ui-monospace,monospace;color:#7d8ea3;letter-spacing:.06em;
  text-transform:uppercase;white-space:nowrap;padding:2px 5px;border-radius:4px;background:rgba(7,11,18,.55);transition:opacity .35s}
.pb-raiz.tem-destaque .pb-nota,.pb-raiz.desmontado .pb-nota{opacity:0}
.pb-medio .pb-rotulo small{display:none}
.pb-medio .pb-rotulo{padding:4px 8px 4px 6px;font-size:10.5px}
.pb-compacto .pb-rotulo{width:24px;height:24px;padding:0;justify-content:center;border-radius:50%;
  background:rgba(9,14,23,.7);font-size:10.5px}
.pb-compacto .pb-rotulo i{width:9px;height:9px}
.pb-compacto .pb-rotulo span,.pb-compacto .pb-rotulo small{display:none}
.pb-compacto .pb-rotulo.ativo{width:auto;padding:0 9px 0 7px;border-radius:12px;gap:6px}
.pb-compacto .pb-rotulo.ativo span{display:inline}
.pb-compacto .pb-nota{display:none}
.pb-cartao{position:absolute;left:14px;top:14px;width:290px;max-width:calc(100% - 28px);box-sizing:border-box;pointer-events:none;
  padding:12px 14px 13px;border-radius:12px;background:rgba(9,14,23,.94);border:1px solid rgba(255,255,255,.09);
  box-shadow:0 18px 40px -18px rgba(0,0,0,.8),inset 0 1px 0 rgba(255,255,255,.04);border-top:2px solid var(--c);
  opacity:0;transition:opacity .2s,border-color .2s;font-size:11.5px;line-height:1.45}
.pb-cartao.direita{left:auto;right:14px}
.pb-cartao.visivel{opacity:1}
.pb-medio .pb-cartao{width:250px;font-size:11px;padding:10px 12px 11px}
.pb-medio .pb-cartao dd{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden}
.pb-cartao header{display:flex;align-items:center;gap:8px;margin-bottom:9px}
.pb-cartao strong{font-size:13px;font-weight:600;color:#fff}
.pb-tag{font-size:9.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;padding:2px 6px;border-radius:4px;
  color:var(--c);background:color-mix(in srgb,var(--c) 14%,transparent);border:1px solid color-mix(in srgb,var(--c) 35%,transparent)}
.pb-cartao dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:4px 10px}
.pb-cartao dt{color:#7d8ea3;font-size:10px;letter-spacing:.06em;text-transform:uppercase;padding-top:1px}
.pb-cartao dd{margin:0;color:#dfe8f2}
.pb-cartao .pb-iob{margin:10px 0 0;padding-top:9px;border-top:1px dashed rgba(255,255,255,.1);display:flex;gap:8px;align-items:baseline;color:#c9f5df}
.pb-compacto .pb-cartao{left:10px;right:10px;top:auto;bottom:50px;width:auto;max-width:none;transition:opacity .2s;
  padding:9px 11px 10px;font-size:10.5px;line-height:1.4}
.pb-compacto .pb-cartao header{margin-bottom:6px}
.pb-compacto .pb-cartao dl{gap:2px 8px}
.pb-compacto .pb-cartao dd{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}
.pb-compacto .pb-cartao .pb-iob{margin-top:6px;padding-top:6px}
.pb-compacto .pb-cartao .pb-iob span:last-child{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.pb-legenda{position:absolute;right:16px;top:14px;display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;
  pointer-events:none;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#93a4b8}
.pb-legenda span{display:flex;align-items:center;gap:6px}
.pb-legenda i{width:7px;height:7px;border-radius:50%;background:var(--c);box-shadow:0 0 8px var(--c)}
.pb-compacto .pb-legenda{right:auto;left:12px;gap:4px 10px;font-size:9px}
.pb-raiz:has(.pb-cartao.visivel:not(.direita)) .pb-legenda{opacity:1}
.pb-raiz:has(.pb-cartao.visivel.direita):not(.pb-compacto) .pb-legenda{opacity:0}
.pb-legenda{transition:opacity .2s}
.pb-controles{position:absolute;right:12px;bottom:10px;display:flex;align-items:center;gap:6px}
.pb-controles button{all:unset;box-sizing:border-box;height:30px;min-width:30px;padding:0 10px;display:inline-flex;align-items:center;
  justify-content:center;gap:6px;border-radius:8px;cursor:pointer;font:600 10.5px/1 'JetBrains Mono',ui-monospace,monospace;
  letter-spacing:.05em;text-transform:uppercase;color:#c9d5e3;background:rgba(9,14,23,.8);border:1px solid rgba(255,255,255,.1);
  transition:border-color .2s,color .2s,background .2s}
.pb-controles button:hover{border-color:#5ee7ff;color:#fff}
.pb-controles button:focus-visible{outline:2px solid #5ee7ff;outline-offset:2px}
.pb-controles button[aria-pressed="true"]{border-color:#5ee7ff;color:#5ee7ff;background:rgba(94,231,255,.08)}
.pb-controles .pb-seta{padding:0;font-size:15px}
.pb-passo{min-width:118px;text-align:center;font-size:10.5px;color:#93a4b8;letter-spacing:.04em;white-space:nowrap;overflow:hidden;
  text-overflow:ellipsis;max-width:180px}
.pb-passo b{color:#eaf1f8;font-weight:600}
.pb-compacto .pb-controles{left:10px;right:10px;justify-content:space-between}
.pb-compacto .pb-passo{flex:1;min-width:0}
.pb-compacto .pb-controles .pb-txt{display:none}
.pb-barra-tour{position:absolute;left:0;bottom:0;height:2px;width:0;background:#5ee7ff;box-shadow:0 0 10px #5ee7ff;opacity:0;transition:opacity .3s}
.pb-raiz.em-tour .pb-barra-tour{opacity:.8}
`;

let usos = 0;
let estilo = null;
export function injetarEstilo() {
  if (usos++ === 0) {
    estilo = document.createElement("style");
    estilo.dataset.protoboard = "";
    estilo.textContent = CSS;
    document.head.appendChild(estilo);
  }
}
export function removerEstilo() {
  if (--usos === 0 && estilo) {
    estilo.remove();
    estilo = null;
  }
}

// rótulo de uma peça: botão HTML preso ao ponto 3D + linha-guia até o topo da peça
export function criarRotulo(dados, ancora, eventos) {
  const cor = SISTEMAS[dados.sistema].cor;
  const alvo = document.createElement("div");
  alvo.className = "pb-alvo";
  const bt = document.createElement("button");
  bt.type = "button";
  bt.className = "pb-rotulo";
  bt.style.setProperty("--c", cor);
  bt.setAttribute("aria-label", `${dados.nome}, ${dados.curto}`);
  bt.innerHTML = `<i></i><span>${dados.nome}</span><small>${dados.curto}</small>`;
  alvo.appendChild(bt);
  bt.addEventListener("pointerenter", (e) => e.pointerType !== "touch" && eventos.entrar(dados.id));
  bt.addEventListener("pointerleave", (e) => e.pointerType !== "touch" && eventos.sair(dados.id));
  bt.addEventListener("focus", () => eventos.entrar(dados.id));
  bt.addEventListener("blur", () => eventos.sair(dados.id));
  bt.addEventListener("click", (e) => {
    e.stopPropagation();
    eventos.clicar(dados.id);
  });

  const off = dados.rotulo;
  const ponto = ancora.clone().add(new THREE.Vector3(off.x, off.y, off.z));
  const obj = new CSS2DObject(alvo);
  obj.center.set(0.5, off.abaixo ? 0 : 1); // base (ou topo, na fileira da frente) do rótulo no ponto
  obj.position.copy(ponto);

  const linhaMat = new THREE.LineBasicMaterial({ color: cor, transparent: true, opacity: 0.55, depthTest: false });
  const linha = new THREE.Line(new THREE.BufferGeometry().setFromPoints([ancora, ponto]), linhaMat);
  linha.renderOrder = 10;
  const ponta = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 8, 6),
    new THREE.MeshBasicMaterial({ color: cor, depthTest: false, transparent: true }),
  );
  ponta.position.copy(ancora);
  ponta.renderOrder = 11;
  ponta.userData.semAresta = true;

  return { obj, linha, ponta, linhaMat, botao: bt, alvo, ponto, abaixo: !!off.abaixo };
}

export function criarNota(texto, p) {
  const d = document.createElement("div");
  d.className = "pb-nota";
  d.textContent = texto;
  const obj = new CSS2DObject(d);
  obj.position.copy(p);
  return obj;
}

export function criarLegenda() {
  const d = document.createElement("div");
  d.className = "pb-legenda";
  d.innerHTML = Object.values(SISTEMAS)
    .map((s) => `<span style="--c:${s.cor}"><i></i>${s.nome}</span>`)
    .join("");
  return d;
}

// barra de controles dentro do módulo: peça anterior/próxima, desmontar/montar e tour
export function criarControles(acoes) {
  const el = document.createElement("div");
  el.className = "pb-controles";
  el.innerHTML = `
    <button type="button" class="pb-seta" data-a="ant" aria-label="Peça anterior">‹</button>
    <span class="pb-passo" aria-live="polite"></span>
    <button type="button" class="pb-seta" data-a="prox" aria-label="Próxima peça">›</button>
    <button type="button" data-a="desmontar" aria-pressed="false"><span aria-hidden="true">⤧</span><span class="pb-txt">Desmontar</span></button>
    <button type="button" data-a="tour" aria-pressed="false"><span aria-hidden="true">▶</span><span class="pb-txt">Tour</span></button>`;
  el.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-a]");
    if (b) acoes[b.dataset.a]?.();
  });
  const passo = el.querySelector(".pb-passo");
  const btDesm = el.querySelector('[data-a="desmontar"]');
  const btTour = el.querySelector('[data-a="tour"]');
  return {
    el,
    atualizar({ indice, total, nome, desmontado, tour }) {
      passo.innerHTML = nome ? `<b>${indice}/${total}</b> · ${esc(nome)}` : `${total} peças · escolha uma`;
      btDesm.setAttribute("aria-pressed", String(desmontado));
      btDesm.querySelector(".pb-txt").textContent = desmontado ? "Montar" : "Desmontar";
      btDesm.querySelector("[aria-hidden]").textContent = desmontado ? "⤨" : "⤧";
      btTour.setAttribute("aria-pressed", String(tour));
      btTour.querySelector("[aria-hidden]").textContent = tour ? "❚❚" : "▶";
    },
  };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export function preencherCartao(el, dados) {
  const s = SISTEMAS[dados.sistema];
  el.style.setProperty("--c", s.cor);
  el.innerHTML = `
    <header><span class="pb-tag">${s.nome}</span><strong>${esc(dados.nome)}</strong></header>
    <dl>
      <dt>Pino</dt><dd>${esc(dados.pino)}</dd>
      <dt>Blynk</dt><dd>${esc(dados.datastream)}</dd>
      <dt>Na casa</dt><dd>${esc(dados.casa)}</dd>
    </dl>
    ${dados.iob ? `<p class="pb-iob" style="--c:${SISTEMAS.iob.cor}"><span class="pb-tag">IoB</span><span>${esc(dados.iob)}</span></p>` : ""}`;
}
