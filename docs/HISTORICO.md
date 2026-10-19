# Histórico do projeto — decisões e aprendizados

Registro do que foi feito, em ordem, e por quê. Serve de base para o relatório e para quem continuar o código.

## 21/09 — Proposta

- Proposta, lista de materiais e pinagem (`docs/Documento_Inicial_Proposta_Materiais.docx`), relatório inicial
  (`docs/Projeto_Final_Casa_Inteligente_IoT_IoB.docx`) e diagrama de arquitetura (`docs/arquitetura_iot_iob.png`).
  Entraram no repositório na organização de 06/10.

## 24/09 – 25/09 — Casa 3D, Arduino e Blynk

- **24/09:** primeira versão da casa 3D em three.js — o gêmeo digital: o que acontece no protoboard acontece na casa.
- **25/09:** firmware ESP32-S3 (DHT22, LDR, HC-SR04, LEDs, servo, buzzer, modo automático/manual, V0–V11) e o servidor
  `server.js` ligando a casa ao Blynk em tempo real (SSE), com modo demonstração. Primeiras capturas.

## 30/09 — Wokwi

- Kit de testes no **Wokwi** (`wokwi/`): circuito simulado + Blynk antes do hardware, guia em `docs/Guia_Testes_Wokwi_Blynk.docx`.

## 06/10 — Repositório

- Estrutura `app-3d/`, `firmware/`, `wokwi/`, `docs/`; o firmware ESP32-S3 saiu à espera da versão em uso no hardware real.

## 07/10 — Troca para o NodeMCU ESP8266 (Fase 0)

- O hardware disponível era **NodeMCU ESP8266** (não ESP32-S3). O firmware real (ajustado pelo grupo) passou a ser a base.
- Credenciais saíram do código para `secrets.h` (ignorado pelo git).
- Gravação pelo VS Code: USB (Ctrl+Shift+B) com detecção de porta; Wi-Fi por **ArduinoOTA** (mesma rede) e **Blynk.Air**
  (qualquer rede — necessário na faculdade, onde o PC fica no cabo e a placa no hotspot do celular).

## 07/10 — Firmware 1.1.0 e Fase 1: mapeamento real

- LDR (A0) e HC-SR04 (TRIG D4 / ECHO D6 com divisor 1k/2k) adicionados; botão foi para D3 (GPIO0) porque D6 virou ECHO
  e D3/D4/D8 têm restrições de boot.
- Casa 3D passou a mostrar exatamente o hardware: PIR ao lado da porta, DHT11 azul, NodeMCU, HC-SR04 na garagem com
  barra de LEDs e o carro parando na distância medida; vista "Garagem".

## 07/10 — Fase 2: desempenho

- Medição inicial: **4.201 chamadas de desenho por quadro**, 781 mil triângulos, 13 luzes, 1 luz pontual com sombra
  (6 renders extras da cena). Causa dos travamentos em vídeo integrado.
- Peças estáticas unidas por material (~520 → 71), sombra sob demanda, luzes externas viram "poças de luz",
  perfis alta/média/leve com detecção da GPU e rebaixamento por FPS, compilação de shaders no carregamento.
  Resultado: ~210 chamadas no perfil leve.
- Proteção contra pixel NaN/infinito antes do bloom (um único pixel inválido deixava a tela 100% preta).

## 07/10 — Fase 3: interface

- Layouts Painel / Compacto / Foco (teclas 1/2/3), painel arrastável e encaixável, eventos recolhíveis.
- Enquadramento dinâmico: a cena centraliza na área livre da tela; vistas reposicionadas para não cortar o que importa.

## 07/10 — Fase 4: visual

- Texturas sem granulado; alpha-to-coverage em folhas/grama; bloom noturno mais contido.
- 4 janelas comandadas pelo servo; carro com carroceria por perfil; seletor de céu (LDR, Relógio, Manual).
- **Regressão encontrada e corrigida**: a união de peças estáticas (fase 2) removia porta e caixilhos presos às paredes.

## 07/10 — Correção do clarão / tela preta

- Causa real: o shader do **holograma de presença** fazia `pow()` de número negativo → NaN em placas reais (DirectX).
  Aparecia quando o PIR detectava alguém (alarme disparado ou presença ao abrir). Corrigido no shader e na proteção.

## 07/10 – 17/10 — Testes de campo

- Teste remoto com ngrok: dois servidores com o mesmo token funcionam (API externa), mas só **uma placa** pode usar o token.
- PCs da faculdade/reserva não conseguiram instalar dependências e rodar o projeto → decisão: **hospedar o servidor**
  (Render) e apresentar a casa 3D no PC do Lucas; celular para controle.
- **LDR e HC-SR04 retirados do protoboard**: configuração instável e interferindo na presença. A placa voltou ao firmware
  sem eles (botão em D6).
- PIR HC-SR501 com atraso/instabilidade: suspeita de ajuste dos trimpots (tempo/sensibilidade) e do jumper de disparo.

## 18/10 — Reta final

Backlog organizado em `docs/ROADMAP.md` e nas issues do GitHub (`scripts/criar-issues.ps1`).
