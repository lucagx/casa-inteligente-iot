// Tela de login: devolve o destino ao formulário, mostra o erro vindo do servidor e o botão de ver a senha.
// O formulário funciona sem este script (POST /entrar comum).
(() => {
  const q = new URLSearchParams(location.search);
  const volta = q.get("volta");
  if (volta) document.getElementById("volta").value = volta;

  const MSG = {
    senha: "Usuário ou senha incorretos. Confira e tente de novo.",
    bloqueado:
      "Muitas tentativas erradas. Espere 15 minutos para tentar de novo.",
  };
  const erro = document.getElementById("erro");
  if (MSG[q.get("erro")]) {
    erro.textContent = MSG[q.get("erro")];
    erro.hidden = false;
  }

  const usuario = document.getElementById("usuario");
  const senha = document.getElementById("senha");
  (q.get("erro") === "senha" ? senha : usuario).focus();

  const ver = document.getElementById("ver");
  ver.addEventListener("click", () => {
    const mostrar = senha.type === "password";
    senha.type = mostrar ? "text" : "password";
    ver.setAttribute("aria-pressed", String(mostrar));
    ver.setAttribute(
      "aria-label",
      mostrar ? "Esconder senha" : "Mostrar senha",
    );
  });
})();
