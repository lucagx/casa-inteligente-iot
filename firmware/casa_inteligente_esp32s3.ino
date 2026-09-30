/*
  ============================================================================
  MINI CASA INTELIGENTE (IoT + IoB) — ESP32-S3 · v3 (teste no Wokwi e placa real)
  Disciplina: Internet das Coisas e do Comportamento — FEPI
  ============================================================================

  >>> AJUSTE AS DUAS CHAVES ABAIXO ANTES DE RODAR <<<

  NO_WOKWI   1 = simulador Wokwi (rede Wokwi-GUEST, LDR do Wokwi é invertido)
             0 = placa real (sua rede Wi-Fi, LDR montado com resistor de 10 kΩ)

  USAR_BLYNK 0 = testa só o circuito, sem internet. Comande pelo Monitor Serial.
             1 = conecta no Blynk (preencha TEMPLATE_ID, TEMPLATE_NAME e TOKEN)

  Comandos pelo Monitor Serial (funcionam com e sem Blynk):
    status          mostra tudo
    modo 1 | modo 0 automático / manual
    luz 1  | luz 0
    porta 1| porta 0
    janela 1|janela 0
    alarme 1|alarme 0

  Pinos virtuais do Blynk:
    V0 luz · V1 porta · V2 comando janela · V3 modo · V4 temperatura
    V5 umidade · V6 CLARO/ESCURO · V7 status janela · V8 status alarme
    V9 alarme armado · V10 luminosidade % · V11 presença
  ============================================================================
*/

#define NO_WOKWI    1
#define USAR_BLYNK  0

// ---- dados do Blynk (Blynk.Console → Devices → seu dispositivo → Device Info)
#define BLYNK_TEMPLATE_ID   "TMPLxxxxxxxx"
#define BLYNK_TEMPLATE_NAME "Mini Casa Inteligente"
#define BLYNK_AUTH_TOKEN    "COLE_SEU_TOKEN_AQUI"
#define BLYNK_PRINT Serial

// ---- Wi-Fi da placa real (use rede 2,4 GHz; o ESP32 não conecta em 5 GHz)
#define WIFI_REAL_SSID  "NOME_DA_REDE"
#define WIFI_REAL_SENHA "SENHA_DA_REDE"

#include <WiFi.h>
#include <DHT.h>
#include <ESP32Servo.h>

#if USAR_BLYNK
  #include <BlynkSimpleEsp32.h>
  #define PUBLICAR(...) Blynk.virtualWrite(__VA_ARGS__)
#else
  #define PUBLICAR(...) do {} while (0)
#endif

// ---------------- Pinagem (ESP32-S3) ----------------
#define PIN_DHT        4
#define PIN_LDR        1
#define PIN_TRIG       5
#define PIN_ECHO       6
#define PIN_SERVO      7
#define PIN_LED_LUZ    15
#define PIN_LED_PORTA  16
#define PIN_BUZZER     17

DHT dht(PIN_DHT, DHT22);
Servo servoJanela;

// ---------------- Regras automáticas ----------------
const float TEMP_ABRIR_JANELA  = 30.0;
const float TEMP_FECHAR_JANELA = 27.0;
const int   LIMIAR_ESCURO_PCT  = 35;     // abaixo disso = escuro
const float DIST_PRESENCA_CM   = 40.0;
const unsigned long DURACAO_ALARME_MS = 4000;

// ---------------- Estado ----------------
bool modoAutomatico   = true;
bool alarmeArmado     = false;
bool luzLigada        = false;
bool portaDestrancada = false;
bool presenca         = false;
int  anguloJanela     = 0;
bool buzzerAtivo      = false;
unsigned long buzzerLigadoDesde = 0;
int  ultimaLuzPct     = -1;
float ultimaTemp = NAN, ultimaUmid = NAN;

unsigned long proxAmbiente = 0, proxPresenca = 0;

// ---------------- Leituras ----------------
float lerDistanciaCM() {
  digitalWrite(PIN_TRIG, LOW);  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH); delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);
  long duracao = pulseIn(PIN_ECHO, HIGH, 30000);
  if (duracao == 0) return 999.0;
  return (duracao * 0.0343) / 2.0;
}

int lerLuzPct() {
  int leitura = analogRead(PIN_LDR);           // 0–4095
  int pct = map(leitura, 0, 4095, 0, 100);
#if NO_WOKWI
  pct = 100 - pct;                             // módulo do Wokwi: mais luz = tensão menor
#endif
  return constrain(pct, 0, 100);
}

// ---------------- Atuadores ----------------
void moverJanela(int destino) {
  int passo = (destino > anguloJanela) ? 1 : -1;
  while (anguloJanela != destino) {
    anguloJanela += passo;
    servoJanela.write(anguloJanela);
    delay(8);                                  // abertura progressiva
  }
  Serial.printf("[SERVO] janela %s (%d°)\n", anguloJanela >= 90 ? "ABERTA" : "FECHADA", anguloJanela);
  PUBLICAR(V7, anguloJanela >= 90 ? "ABERTA" : "FECHADA");
}

void aplicarLuz(bool ligar, bool forcar) {
  if (!forcar && ligar == luzLigada) return;   // só publica quando muda
  luzLigada = ligar;
  digitalWrite(PIN_LED_LUZ, ligar ? HIGH : LOW);
  Serial.printf("[LED GPIO15] luz %s\n", ligar ? "LIGADA" : "DESLIGADA");
  PUBLICAR(V0, ligar ? 1 : 0);
}

void aplicarPorta(bool destrancar) {
  portaDestrancada = destrancar;
  digitalWrite(PIN_LED_PORTA, destrancar ? HIGH : LOW);
  Serial.printf("[LED GPIO16] porta %s\n", destrancar ? "DESTRANCADA" : "TRANCADA");
  PUBLICAR(V1, destrancar ? 1 : 0);
}

// tone() funciona no buzzer ativo e no passivo (no Wokwi é obrigatório)
void dispararAlarme() {
  buzzerAtivo = true;
  buzzerLigadoDesde = millis();
  tone(PIN_BUZZER, 2000);
  Serial.println("[ALARME] presença com alarme armado — SIRENE LIGADA");
  PUBLICAR(V8, "ALARME ATIVO");
}

void pararAlarme() {
  noTone(PIN_BUZZER);
  buzzerAtivo = false;
  PUBLICAR(V8, alarmeArmado ? "ARMADO" : "DESARMADO");
}

// ---------------- Comandos (Blynk e Monitor Serial usam os mesmos) ----------------
void cmdModo(int v) {
  modoAutomatico = (v == 1);
  Serial.printf("[MODO] %s\n", modoAutomatico ? "AUTOMÁTICO" : "MANUAL");
  PUBLICAR(V3, modoAutomatico ? 1 : 0);
}
void cmdLuz(int v) {
  if (!modoAutomatico) aplicarLuz(v == 1, true);
  else { Serial.println("[IGNORADO] luz: mude para modo manual (modo 0)"); PUBLICAR(V0, luzLigada ? 1 : 0); }
}
void cmdPorta(int v) {
  if (!modoAutomatico) aplicarPorta(v == 1);
  else { Serial.println("[IGNORADO] porta: mude para modo manual (modo 0)"); PUBLICAR(V1, portaDestrancada ? 1 : 0); }
}
void cmdJanela(int v) {
  if (!modoAutomatico) moverJanela(v == 1 ? 90 : 0);
  else { Serial.println("[IGNORADO] janela: mude para modo manual (modo 0)"); PUBLICAR(V7, anguloJanela >= 90 ? "ABERTA" : "FECHADA"); }
}
void cmdAlarme(int v) {
  alarmeArmado = (v == 1);
  Serial.printf("[ALARME] %s\n", alarmeArmado ? "ARMADO" : "DESARMADO");
  if (!alarmeArmado && buzzerAtivo) pararAlarme();
  else PUBLICAR(V8, alarmeArmado ? "ARMADO" : "DESARMADO");
}

void imprimirStatus() {
  Serial.println("---------------- STATUS ----------------");
  Serial.printf(" Temperatura: %.1f °C   Umidade: %.0f %%\n", ultimaTemp, ultimaUmid);
  Serial.printf(" Luminosidade: %d %% (%s)\n", ultimaLuzPct, ultimaLuzPct < LIMIAR_ESCURO_PCT ? "ESCURO" : "CLARO");
  Serial.printf(" Presença: %s\n", presenca ? "SIM" : "não");
  Serial.printf(" Modo: %s | Luz: %s | Porta: %s | Janela: %s | Alarme: %s%s\n",
                modoAutomatico ? "AUTO" : "MANUAL", luzLigada ? "ON" : "OFF",
                portaDestrancada ? "DESTRANCADA" : "TRANCADA", anguloJanela >= 90 ? "ABERTA" : "FECHADA",
                alarmeArmado ? "ARMADO" : "DESARMADO", buzzerAtivo ? " (TOCANDO)" : "");
#if USAR_BLYNK
  Serial.printf(" Blynk: %s\n", Blynk.connected() ? "conectado" : "DESCONECTADO");
#else
  Serial.println(" Blynk: desativado (USAR_BLYNK 0)");
#endif
  Serial.println("----------------------------------------");
}

void lerComandoSerial() {
  if (!Serial.available()) return;
  String linha = Serial.readStringUntil('\n');
  linha.trim(); linha.toLowerCase();
  if (linha.length() == 0) return;
  int esp = linha.indexOf(' ');
  String cmd = esp > 0 ? linha.substring(0, esp) : linha;
  int valor = esp > 0 ? linha.substring(esp + 1).toInt() : -1;

  if (cmd == "status") imprimirStatus();
  else if (cmd == "modo" && valor >= 0) cmdModo(valor);
  else if (cmd == "luz" && valor >= 0) cmdLuz(valor);
  else if (cmd == "porta" && valor >= 0) cmdPorta(valor);
  else if (cmd == "janela" && valor >= 0) cmdJanela(valor);
  else if (cmd == "alarme" && valor >= 0) cmdAlarme(valor);
  else Serial.println("Comandos: status | modo 0/1 | luz 0/1 | porta 0/1 | janela 0/1 | alarme 0/1");
}

// ---------------- Blynk ----------------
#if USAR_BLYNK
BLYNK_CONNECTED() {
  Serial.println("[BLYNK] conectado — sincronizando modo e alarme");
  Blynk.syncVirtual(V3, V9);                   // recupera o que foi escolhido no app
  Blynk.virtualWrite(V0, luzLigada ? 1 : 0);
  Blynk.virtualWrite(V1, portaDestrancada ? 1 : 0);
  Blynk.virtualWrite(V7, anguloJanela >= 90 ? "ABERTA" : "FECHADA");
  Blynk.virtualWrite(V8, alarmeArmado ? "ARMADO" : "DESARMADO");
  Blynk.virtualWrite(V11, presenca ? 1 : 0);
}
BLYNK_WRITE(V0) { cmdLuz(param.asInt()); }
BLYNK_WRITE(V1) { cmdPorta(param.asInt()); }
BLYNK_WRITE(V2) { cmdJanela(param.asInt()); }
BLYNK_WRITE(V3) { cmdModo(param.asInt()); }
BLYNK_WRITE(V9) { cmdAlarme(param.asInt()); }
#endif

// ---------------- Tarefas periódicas ----------------
void lerAmbiente() {                           // a cada 2,5 s (DHT22 exige ≥ 2 s)
  float temperatura = dht.readTemperature();
  float umidade     = dht.readHumidity();
  int   luzPct      = lerLuzPct();
  bool  escuro      = luzPct < LIMIAR_ESCURO_PCT;

  if (isnan(temperatura) || isnan(umidade)) {
    Serial.println("[DHT22] leitura falhou — confira ligação do pino de dados (GPIO4)");
  } else {
    ultimaTemp = temperatura; ultimaUmid = umidade;
    PUBLICAR(V4, temperatura);
    PUBLICAR(V5, umidade);
  }
  PUBLICAR(V6, escuro ? "ESCURO" : "CLARO");
  if (abs(luzPct - ultimaLuzPct) >= 2) {       // ignora ruído do LDR
    ultimaLuzPct = luzPct;
    PUBLICAR(V10, luzPct);
  }
  Serial.printf("[SENSORES] %.1f °C · %.0f %% · luz %d %% (%s)\n", ultimaTemp, ultimaUmid, luzPct, escuro ? "ESCURO" : "CLARO");

  if (modoAutomatico) {                        // ---- regras automáticas ----
    if (!isnan(temperatura)) {
      if (temperatura >= TEMP_ABRIR_JANELA && anguloJanela == 0) {
        Serial.println("[REGRA] temperatura ≥ 30 °C → abrindo janela");
        moverJanela(90);
      } else if (temperatura <= TEMP_FECHAR_JANELA && anguloJanela == 90) {
        Serial.println("[REGRA] temperatura ≤ 27 °C → fechando janela");
        moverJanela(0);
      }
    }
    aplicarLuz(escuro, false);
  }
}

void verificarPresenca() {                     // a cada 150 ms
  float d = lerDistanciaCM();
  bool agora = d <= DIST_PRESENCA_CM;
  if (agora != presenca) {                     // publica só na mudança
    presenca = agora;
    if (presenca) Serial.printf("[HC-SR04] presença detectada a %.0f cm\n", d);
    else Serial.println("[HC-SR04] área livre");
    PUBLICAR(V11, presenca ? 1 : 0);
  }
  if (alarmeArmado && presenca && !buzzerAtivo) dispararAlarme();
  if (buzzerAtivo) {
    // sirene de dois tons
    tone(PIN_BUZZER, ((millis() / 250) % 2) ? 2400 : 1800);
    if (millis() - buzzerLigadoDesde >= DURACAO_ALARME_MS) {
      pararAlarme();
      Serial.println("[ALARME] sirene desligada após 4 s");
    }
  }
}

// ---------------- Wi-Fi ----------------
#if USAR_BLYNK
void conectar() {
#if NO_WOKWI
  const char *ssid = "Wokwi-GUEST", *senha = "";
  WiFi.begin(ssid, senha, 6);                  // canal 6 acelera a conexão no Wokwi
#else
  const char *ssid = WIFI_REAL_SSID, *senha = WIFI_REAL_SENHA;
  WiFi.begin(ssid, senha);
#endif
  Serial.printf("[WI-FI] conectando em %s", ssid);
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 20000) { delay(250); Serial.print('.'); }
  Serial.println(WiFi.status() == WL_CONNECTED ? " ok" : " FALHOU (confira nome/senha e se a rede é 2,4 GHz)");

  Blynk.config(BLYNK_AUTH_TOKEN);
  if (!Blynk.connect(10000)) Serial.println("[BLYNK] não conectou — confira TOKEN e TEMPLATE_ID. Circuito segue funcionando.");
}
#endif

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n=== Mini Casa Inteligente · ESP32-S3 ===");

  dht.begin();
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  pinMode(PIN_LED_LUZ, OUTPUT);
  pinMode(PIN_LED_PORTA, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  analogReadResolution(12);

  servoJanela.setPeriodHertz(50);
  servoJanela.attach(PIN_SERVO, 500, 2400);
  servoJanela.write(0);

#if USAR_BLYNK
  conectar();
#endif
  Serial.println("[SISTEMA] pronto. Digite 'status' ou um comando no Monitor Serial.");
}

void loop() {
#if USAR_BLYNK
  Blynk.run();
#endif
  lerComandoSerial();
  unsigned long agora = millis();
  if (agora >= proxAmbiente) { proxAmbiente = agora + 2500; lerAmbiente(); }
  if (agora >= proxPresenca) { proxPresenca = agora + 150; verificarPresenca(); }
}
