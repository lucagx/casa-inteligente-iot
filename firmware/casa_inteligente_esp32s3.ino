/*
  ============================================================================
  MINI CASA INTELIGENTE (IoT + IoB) — firmware ESP32-S3  · v2
  Disciplina: Internet das Coisas e do Comportamento — FEPI
  ============================================================================
  Tudo que este firmware escreve no Blynk é espelhado na casa 3D:
    V0  luz (LED GPIO15)            -> luzes da casa 3D acendem/apagam
    V1  porta (LED GPIO16)          -> porta 3D abre e LED da trava muda de cor
    V2  comando manual da janela    <- botão do app/painel
    V3  modo automático(1)/manual(0)
    V4  temperatura (DHT22)         -> painel e TV da sala 3D
    V5  umidade (DHT22)
    V6  CLARO/ESCURO (LDR)
    V7  status da janela ABERTA/FECHADA (servo GPIO7) -> janela 3D gira
    V8  status do alarme            -> sirene 3D pisca
    V9  armar/desarmar alarme
    V10 luminosidade 0–100 % (LDR)  -> NOVO: controla o céu dia/noite do 3D
    V11 presença 1/0 (HC-SR04)      -> NOVO: holograma de pessoa na entrada 3D

  No Blynk.Console crie os datastreams V10 (Integer 0–100) e V11 (Integer 0–1)
  além dos que já existiam.

  Bibliotecas: DHT sensor library (Adafruit) + Adafruit Unified Sensor,
               ESP32Servo, Blynk (Volodymyr Shymanskyy)
  ============================================================================
*/

#define BLYNK_TEMPLATE_ID   "TMPLxxxxxxx"
#define BLYNK_TEMPLATE_NAME "Mini Casa Inteligente"
#define BLYNK_AUTH_TOKEN    "SEU_TOKEN_AQUI"
#define BLYNK_PRINT Serial

#include <WiFi.h>
#include <BlynkSimpleEsp32.h>
#include <DHT.h>
#include <ESP32Servo.h>

char auth[] = BLYNK_AUTH_TOKEN;
char ssid[] = "NOME_DA_REDE";
char pass[] = "SENHA_DA_REDE";

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
BlynkTimer timer;

// ---------------- Regras (IoB) ----------------
const float TEMP_ABRIR_JANELA  = 30.0;
const float TEMP_FECHAR_JANELA = 27.0;
const int   LIMIAR_ESCURO      = 1500;   // ADC 0–4095 (≈ 35 %)
const float DIST_PRESENCA_CM   = 40.0;
const unsigned long DURACAO_ALARME_MS = 4000;

// ---------------- Estado ----------------
bool modoAutomatico = true;
bool alarmeArmado   = false;
bool luzLigada      = false;
bool portaDestrancada = false;
bool presenca       = false;
int  anguloJanela   = 0;
bool buzzerAtivo    = false;
unsigned long buzzerLigadoDesde = 0;
int  ultimaLuzPct   = -1;

// ---------------- Auxiliares ----------------
float lerDistanciaCM() {
  digitalWrite(PIN_TRIG, LOW);  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH); delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);
  long duracao = pulseIn(PIN_ECHO, HIGH, 30000);
  if (duracao == 0) return 999.0;
  return (duracao * 0.0343) / 2.0;
}

void moverJanela(int destino) {
  int passo = (destino > anguloJanela) ? 1 : -1;
  while (anguloJanela != destino) {
    anguloJanela += passo;
    servoJanela.write(anguloJanela);
    delay(8);
  }
  Blynk.virtualWrite(V7, anguloJanela >= 90 ? "ABERTA" : "FECHADA");
}

void aplicarLuz(bool ligar, bool forcar) {
  if (!forcar && ligar == luzLigada) return; // só envia quando muda (economiza cota do Blynk)
  luzLigada = ligar;
  digitalWrite(PIN_LED_LUZ, ligar ? HIGH : LOW);
  Blynk.virtualWrite(V0, ligar ? 1 : 0);
}

void aplicarPorta(bool destrancar) {
  portaDestrancada = destrancar;
  digitalWrite(PIN_LED_PORTA, destrancar ? HIGH : LOW);
  Blynk.virtualWrite(V1, destrancar ? 1 : 0);
}

void dispararAlarme() {
  digitalWrite(PIN_BUZZER, HIGH);
  buzzerAtivo = true;
  buzzerLigadoDesde = millis();
  Blynk.virtualWrite(V8, "ALARME ATIVO");
}

// ---------------- Blynk ----------------
BLYNK_CONNECTED() {
  // recupera modo e alarme escolhidos no app/painel e publica o estado atual
  Blynk.syncVirtual(V3, V9);
  Blynk.virtualWrite(V0, luzLigada ? 1 : 0);
  Blynk.virtualWrite(V1, portaDestrancada ? 1 : 0);
  Blynk.virtualWrite(V7, anguloJanela >= 90 ? "ABERTA" : "FECHADA");
  Blynk.virtualWrite(V8, alarmeArmado ? "ARMADO" : "DESARMADO");
  Blynk.virtualWrite(V11, presenca ? 1 : 0);
}

// Comandos manuais só valem no modo manual. No automático, o firmware
// republica o estado real para o app/painel não mostrar um valor falso.
BLYNK_WRITE(V0) {
  if (!modoAutomatico) aplicarLuz(param.asInt() == 1, true);
  else Blynk.virtualWrite(V0, luzLigada ? 1 : 0);
}
BLYNK_WRITE(V1) {
  if (!modoAutomatico) aplicarPorta(param.asInt() == 1);
  else Blynk.virtualWrite(V1, portaDestrancada ? 1 : 0);
}
BLYNK_WRITE(V2) {
  if (!modoAutomatico) moverJanela(param.asInt() == 1 ? 90 : 0);
  else Blynk.virtualWrite(V7, anguloJanela >= 90 ? "ABERTA" : "FECHADA");
}
BLYNK_WRITE(V3) { modoAutomatico = (param.asInt() == 1); }
BLYNK_WRITE(V9) {
  alarmeArmado = (param.asInt() == 1);
  if (!alarmeArmado) { digitalWrite(PIN_BUZZER, LOW); buzzerAtivo = false; }
  Blynk.virtualWrite(V8, alarmeArmado ? "ARMADO" : "DESARMADO");
}

// ---------------- Tarefas periódicas ----------------
void lerAmbiente() {                        // a cada 2,5 s (DHT22 exige ≥ 2 s)
  float temperatura = dht.readTemperature();
  float umidade     = dht.readHumidity();
  int   leituraLDR  = analogRead(PIN_LDR);
  bool  escuro      = leituraLDR < LIMIAR_ESCURO;
  int   luzPct      = map(leituraLDR, 0, 4095, 0, 100);

  if (!isnan(temperatura)) Blynk.virtualWrite(V4, temperatura);
  if (!isnan(umidade))     Blynk.virtualWrite(V5, umidade);
  Blynk.virtualWrite(V6, escuro ? "ESCURO" : "CLARO");
  if (abs(luzPct - ultimaLuzPct) >= 2) {    // evita mensagens por ruído do LDR
    ultimaLuzPct = luzPct;
    Blynk.virtualWrite(V10, luzPct);
  }

  if (modoAutomatico) {                      // ---- camada IoB ----
    if (!isnan(temperatura)) {
      if (temperatura >= TEMP_ABRIR_JANELA && anguloJanela == 0) moverJanela(90);
      else if (temperatura <= TEMP_FECHAR_JANELA && anguloJanela == 90) moverJanela(0);
    }
    aplicarLuz(escuro, false);
  }
}

void verificarPresenca() {                   // a cada 150 ms
  bool agora = lerDistanciaCM() <= DIST_PRESENCA_CM;
  if (agora != presenca) {                   // publica só na mudança
    presenca = agora;
    Blynk.virtualWrite(V11, presenca ? 1 : 0);
  }
  if (alarmeArmado && presenca && !buzzerAtivo) dispararAlarme();
  if (buzzerAtivo && millis() - buzzerLigadoDesde >= DURACAO_ALARME_MS) {
    digitalWrite(PIN_BUZZER, LOW);
    buzzerAtivo = false;
    Blynk.virtualWrite(V8, alarmeArmado ? "ARMADO" : "DESARMADO");
  }
}

void setup() {
  Serial.begin(115200);
  dht.begin();
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  pinMode(PIN_LED_LUZ, OUTPUT);
  pinMode(PIN_LED_PORTA, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  analogReadResolution(12);

  servoJanela.attach(PIN_SERVO);
  servoJanela.write(0);

  Blynk.begin(auth, ssid, pass);
  timer.setInterval(2500L, lerAmbiente);
  timer.setInterval(150L, verificarPresenca);
}

void loop() {
  Blynk.run();
  timer.run();
}
