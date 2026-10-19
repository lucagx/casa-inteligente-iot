/*
  MINI CASA INTELIGENTE — NodeMCU ESP8266 + Blynk

  Componentes usados:
  - NodeMCU ESP8266
  - DHT11
  - Sensor de presenca PIR HC-SR501
  - LDR (fotorresistor) + resistor de 10k        -> dia/noite        (opcional: USAR_LDR)
  - Sensor ultrassonico HC-SR04                  -> distancia do carro (opcional: USAR_HCSR04)
  - Microservo SG90
  - 2 LEDs com resistores de 220 ohms
  - Buzzer
  - Botao: D6 sem o HC-SR04; com o HC-SR04 o D6 vira ECHO e o botao vai para o D3 (FLASH)

  Pinos virtuais Blynk:
  V0  = luz
  V1  = porta
  V2  = janela
  V3  = modo automatico
  V4  = temperatura
  V5  = umidade
  V6  = CLARO / ESCURO (LDR)
  V7  = status da janela
  V8  = status do alarme
  V9  = armar/desarmar alarme
  V10 = luminosidade 0-100 % (LDR)
  V11 = presenca
  V12 = distancia do carro em cm (HC-SR04)
  V14 = deteccoes de presenca hoje
*/

// Token do Blynk, Wi-Fi e senha do OTA ficam em secrets.h (fora do git).
// Copie secrets.example.h para secrets.h e preencha.
#include "secrets.h"

// Suba este número a cada versão enviada pelo Blynk.Air (formato X.Y.Z)
#define BLYNK_FIRMWARE_VERSION "1.2.0"
#define BLYNK_PRINT Serial

// Sensores opcionais: o LDR e o HC-SR04 sairam do protoboard (instaveis e atrapalhavam o PIR).
// 0 = codigo desligado (nao le, nao publica V6/V10/V12, nao configura os pinos); 1 = volta a usar.
#define USAR_LDR     0
#define USAR_HCSR04  0

#include <ESP8266WiFi.h>
#include <BlynkSimpleEsp8266.h>
#include <DHT.h>
#include <Servo.h>

// Pinagem do NodeMCU
#define PIN_DHT        D2
#define PIN_PIR        D5
#if USAR_HCSR04
#define PIN_BOTAO      D3   // D6 e o ECHO; GPIO0 = botao FLASH da placa (nao segurar ao ligar)
#else
#define PIN_BOTAO      D6   // montagem atual: botao externo para o GND
#endif
#define PIN_SERVO      D7
#define PIN_LED_LUZ    D1
#define PIN_LED_PORTA  D0
#define PIN_BUZZER     D8
#define PIN_LDR        A0   // divisor: 3V3 -- LDR -- A0 -- 10k -- GND
#define PIN_TRIG       D4   // HC-SR04 TRIG
#define PIN_ECHO       D6   // HC-SR04 ECHO via divisor (1k do ECHO ao D6, 2k do D6 ao GND)

#define TIPO_DHT DHT11

#include "ota.h"   // atualização pelo Wi-Fi (Blynk.Air e ArduinoOTA)

DHT dht(PIN_DHT, TIPO_DHT);
Servo servoJanela;

const float TEMP_ABRIR_JANELA = 30.0;
const float TEMP_FECHAR_JANELA = 27.0;
const unsigned long DURACAO_ALARME_MS = 4000;
const unsigned long INTERVALO_DHT_MS = 2500;
const unsigned long DEBOUNCE_BOTAO_MS = 50;

// PIR HC-SR501: liga na hora (borda de subida) e so desliga depois de N ms sem sinal,
// para nao piscar enquanto a pessoa esta parada. Os primeiros ~60 s apos ligar sao aquecimento.
const unsigned long PRESENCA_RETENCAO_MS = 8000;
const unsigned long PIR_AQUECIMENTO_MS = 60000;
const long FUSO_SEGUNDOS = -3L * 3600;   // horario de Brasilia, para zerar o contador a meia-noite

// LDR: abaixo deste percentual o ambiente e considerado escuro
const int LIMIAR_ESCURO_PCT = 35;
const unsigned long INTERVALO_LDR_MS = 1000;
// true: no modo automatico a luz acende com presenca SOMENTE no escuro
// false: volta ao comportamento anterior (luz acompanha a presenca sempre)
const bool LUZ_SO_NO_ESCURO = true;

// HC-SR04: leitura da garagem
const unsigned long INTERVALO_DISTANCIA_MS = 300;
const int DISTANCIA_MAX_CM = 200;

bool modoAutomatico = true;
bool alarmeArmado = false;
bool alarmeTocando = false;
bool presenca = false;
bool luzLigada = false;
bool portaDestrancada = false;
int anguloJanela = 0;
float ultimaTemperatura = NAN;
float ultimaUmidade = NAN;
int luminosidadePct = 100;
bool escuro = false;
int distanciaCarroCm = -1;
unsigned long ultimoSinalPir = 0;
unsigned long deteccoesHoje = 0;
long diaAtual = -1;              // dia (horario local) do contador; -1 = ainda sem relogio
unsigned long epochBase = 0;     // hora do Blynk (RTC) e o millis() em que ela chegou
unsigned long millisEpochBase = 0;

bool ultimaLeituraBotao = HIGH;
bool estadoEstavelBotao = HIGH;
unsigned long instanteMudancaBotao = 0;
unsigned long alarmeLigadoDesde = 0;
unsigned long proximaLeituraDht = 0;
unsigned long proximaReconexao = 0;
unsigned long proximaLeituraLdr = 0;
unsigned long proximaMedicaoDistancia = 0;

void publicarEstados() {
  if (!Blynk.connected()) return;

  Blynk.virtualWrite(V0, luzLigada);
  Blynk.virtualWrite(V1, portaDestrancada);
  Blynk.virtualWrite(V3, modoAutomatico);
  Blynk.virtualWrite(V7, anguloJanela >= 90 ? "ABERTA" : "FECHADA");
  Blynk.virtualWrite(V8, alarmeTocando ? "ALARME ATIVO" :
                             (alarmeArmado ? "ARMADO" : "DESARMADO"));
  Blynk.virtualWrite(V9, alarmeArmado);
  Blynk.virtualWrite(V11, presenca);
  Blynk.virtualWrite(V14, deteccoesHoje);
#if USAR_LDR
  Blynk.virtualWrite(V6, escuro ? "ESCURO" : "CLARO");
  Blynk.virtualWrite(V10, luminosidadePct);
#endif
#if USAR_HCSR04
  if (distanciaCarroCm >= 0) Blynk.virtualWrite(V12, distanciaCarroCm);
#endif
}

void controlarLuz(bool ligar) {
  luzLigada = ligar;
  digitalWrite(PIN_LED_LUZ, ligar ? HIGH : LOW);
  if (Blynk.connected()) Blynk.virtualWrite(V0, ligar);
  Serial.printf("[LUZ] %s\n", ligar ? "LIGADA" : "DESLIGADA");
}

// Regra automatica da luz: presenca (PIR) e, se LUZ_SO_NO_ESCURO, ambiente escuro (LDR).
// Sem o LDR a luz segue so a presenca.
void atualizarLuzAutomatica() {
  if (!modoAutomatico) return;
#if USAR_LDR
  bool desejada = presenca && (!LUZ_SO_NO_ESCURO || escuro);
#else
  bool desejada = presenca;
#endif
  if (desejada != luzLigada) controlarLuz(desejada);
}

void controlarPorta(bool destrancar) {
  portaDestrancada = destrancar;
  digitalWrite(PIN_LED_PORTA, destrancar ? HIGH : LOW);
  if (Blynk.connected()) Blynk.virtualWrite(V1, destrancar);
  Serial.printf("[PORTA] %s\n", destrancar ? "DESTRANCADA" : "TRANCADA");
}

void moverJanela(int destino) {
  destino = constrain(destino, 0, 90);

  int passo = destino > anguloJanela ? 1 : -1;
  while (anguloJanela != destino) {
    anguloJanela += passo;
    servoJanela.write(anguloJanela);
    delay(8);
    yield();
  }

  if (Blynk.connected()) {
    Blynk.virtualWrite(V7, anguloJanela >= 90 ? "ABERTA" : "FECHADA");
  }
  Serial.printf("[JANELA] %s\n", anguloJanela >= 90 ? "ABERTA" : "FECHADA");
}

void pararAlarme() {
  noTone(PIN_BUZZER);
  digitalWrite(PIN_BUZZER, LOW);
  alarmeTocando = false;

  if (Blynk.connected()) {
    Blynk.virtualWrite(V8, alarmeArmado ? "ARMADO" : "DESARMADO");
  }
}

void dispararAlarme() {
  if (alarmeTocando) return;

  alarmeTocando = true;
  alarmeLigadoDesde = millis();
  tone(PIN_BUZZER, 2000);

  if (Blynk.connected()) Blynk.virtualWrite(V8, "ALARME ATIVO");
  Serial.println("[ALARME] presenca detectada");
}

void definirAlarme(bool armar) {
  alarmeArmado = armar;

  if (!alarmeArmado) pararAlarme();

  if (Blynk.connected()) {
    Blynk.virtualWrite(V9, alarmeArmado);
    Blynk.virtualWrite(V8, alarmeArmado ? "ARMADO" : "DESARMADO");
  }

  Serial.printf("[ALARME] %s\n", alarmeArmado ? "ARMADO" : "DESARMADO");
}

void verificarBotao() {
  bool leitura = digitalRead(PIN_BOTAO);

  if (leitura != ultimaLeituraBotao) {
    instanteMudancaBotao = millis();
    ultimaLeituraBotao = leitura;
  }

  if (millis() - instanteMudancaBotao >= DEBOUNCE_BOTAO_MS &&
      leitura != estadoEstavelBotao) {
    estadoEstavelBotao = leitura;

    // INPUT_PULLUP: pressionado = LOW
    if (estadoEstavelBotao == LOW) {
      definirAlarme(!alarmeArmado);
    }
  }
}

// dia local a partir da hora do Blynk (-1 enquanto o relogio nao chegou)
long diaLocal() {
  if (epochBase == 0) return -1;
  unsigned long agora = epochBase + (millis() - millisEpochBase) / 1000;
  return ((long)agora + FUSO_SEGUNDOS) / 86400L;
}

void contarDeteccao() {
  long dia = diaLocal();
  if (dia >= 0 && dia != diaAtual) {   // virou o dia: zera o contador
    diaAtual = dia;
    deteccoesHoje = 0;
  }
  deteccoesHoje++;
  if (Blynk.connected()) Blynk.virtualWrite(V14, deteccoesHoje);
}

void verificarPresenca() {
  // aquecimento do HC-SR501: as leituras do primeiro minuto sao falsas
  bool sinal = millis() > PIR_AQUECIMENTO_MS && digitalRead(PIN_PIR) == HIGH;
  if (sinal) ultimoSinalPir = millis();

  // liga na borda de subida (publica V11 na hora); desliga so apos a retencao sem sinal
  bool presencaAgora = sinal || (presenca && millis() - ultimoSinalPir < PRESENCA_RETENCAO_MS);

  if (presencaAgora != presenca) {
    presenca = presencaAgora;
    Serial.printf("[PIR] presenca: %s\n", presenca ? "SIM" : "NAO");

    if (Blynk.connected()) Blynk.virtualWrite(V11, presenca);
    if (presenca) contarDeteccao();

    // No modo automatico, a luz acompanha a presenca (e o escuro, ver LUZ_SO_NO_ESCURO).
    atualizarLuzAutomatica();
  }

  if (alarmeArmado && presenca) dispararAlarme();

  if (alarmeTocando) {
    tone(PIN_BUZZER, ((millis() / 250) % 2) ? 2400 : 1800);

    if (millis() - alarmeLigadoDesde >= DURACAO_ALARME_MS) {
      pararAlarme();
    }
  }
}

void lerTemperaturaUmidade() {
  float temperatura = dht.readTemperature();
  float umidade = dht.readHumidity();

  if (isnan(temperatura) || isnan(umidade)) {
    Serial.println("[DHT11] falha na leitura - confira VCC, OUT e GND");
    return;
  }

  ultimaTemperatura = temperatura;
  ultimaUmidade = umidade;

  Serial.printf("[DHT11] %.1f C | %.0f %%\n", temperatura, umidade);

  if (Blynk.connected()) {
    Blynk.virtualWrite(V4, temperatura);
    Blynk.virtualWrite(V5, umidade);
  }

  if (modoAutomatico) {
    if (temperatura >= TEMP_ABRIR_JANELA && anguloJanela == 0) {
      moverJanela(90);
    } else if (temperatura <= TEMP_FECHAR_JANELA && anguloJanela == 90) {
      moverJanela(0);
    }
  }
}

#if USAR_LDR
void lerLuminosidade() {
  int leitura = analogRead(PIN_LDR);                 // 0-1023
  int pct = constrain(map(leitura, 0, 1023, 0, 100), 0, 100);
  bool escuroAgora = pct < LIMIAR_ESCURO_PCT;

  if (abs(pct - luminosidadePct) >= 2) {             // ignora ruido do LDR
    luminosidadePct = pct;
    if (Blynk.connected()) Blynk.virtualWrite(V10, luminosidadePct);
  }
  if (escuroAgora != escuro) {
    escuro = escuroAgora;
    Serial.printf("[LDR] %d %% - %s\n", pct, escuro ? "ESCURO" : "CLARO");
    if (Blynk.connected()) Blynk.virtualWrite(V6, escuro ? "ESCURO" : "CLARO");
    atualizarLuzAutomatica();
  }
}
#endif

#if USAR_HCSR04
void medirDistancia() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);

  unsigned long duracao = pulseIn(PIN_ECHO, HIGH, 25000UL);   // ~4 m de alcance
  int cm = duracao == 0 ? DISTANCIA_MAX_CM
                        : constrain((int)(duracao * 0.0343 / 2.0), 2, DISTANCIA_MAX_CM);

  if (distanciaCarroCm < 0 || abs(cm - distanciaCarroCm) >= 2) {   // publica so na mudanca
    distanciaCarroCm = cm;
    if (Blynk.connected()) Blynk.virtualWrite(V12, distanciaCarroCm);
  }
}
#endif

BLYNK_CONNECTED() {
  Serial.println("[BLYNK] conectado");
  Blynk.syncVirtual(V3, V9);
  Blynk.sendInternal("rtc", "sync");   // hora para zerar o contador de deteccoes a meia-noite
  publicarEstados();
}

// resposta do relogio do Blynk (segundos desde 1970, UTC)
BLYNK_WRITE(InternalPinRTC) {
  epochBase = param.asLong();
  millisEpochBase = millis();
  if (diaAtual < 0) diaAtual = diaLocal();
}

BLYNK_WRITE(V0) {
  if (!modoAutomatico) controlarLuz(param.asInt() == 1);
  else Blynk.virtualWrite(V0, luzLigada);
}

BLYNK_WRITE(V1) {
  if (!modoAutomatico) controlarPorta(param.asInt() == 1);
  else Blynk.virtualWrite(V1, portaDestrancada);
}

BLYNK_WRITE(V2) {
  if (!modoAutomatico) moverJanela(param.asInt() == 1 ? 90 : 0);
  else Blynk.virtualWrite(V7, anguloJanela >= 90 ? "ABERTA" : "FECHADA");
}

BLYNK_WRITE(V3) {
  modoAutomatico = param.asInt() == 1;
  Serial.printf("[MODO] %s\n", modoAutomatico ? "AUTOMATICO" : "MANUAL");
  atualizarLuzAutomatica();
}

BLYNK_WRITE(V9) {
  definirAlarme(param.asInt() == 1);
}

void conectar() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_SENHA);

  Serial.printf("[WI-FI] conectando em %s", WIFI_SSID);
  unsigned long inicio = millis();

  while (WiFi.status() != WL_CONNECTED && millis() - inicio < 20000) {
    delay(250);
    Serial.print('.');
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println(" conectado");
    Blynk.config(BLYNK_AUTH_TOKEN);

    if (!Blynk.connect(10000)) {
      Serial.println("[BLYNK] nao conectou - confira o token");
    }
  } else {
    Serial.println(" falhou - confira a rede Wi-Fi 2,4 GHz");
  }
}

void manterConexao() {
  if (millis() < proximaReconexao) return;
  proximaReconexao = millis() + 10000;

  if (WiFi.status() != WL_CONNECTED) {
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_SENHA);
  } else if (!Blynk.connected()) {
    Blynk.connect(3000);
  }
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n=== Mini Casa Inteligente - ESP8266 ===");

  pinMode(PIN_PIR, INPUT);
  pinMode(PIN_BOTAO, INPUT_PULLUP);
  pinMode(PIN_LED_LUZ, OUTPUT);
  pinMode(PIN_LED_PORTA, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
#if USAR_HCSR04
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  digitalWrite(PIN_TRIG, LOW);
#endif

  digitalWrite(PIN_LED_LUZ, LOW);
  digitalWrite(PIN_LED_PORTA, LOW);
  digitalWrite(PIN_BUZZER, LOW);

  dht.begin();

  servoJanela.attach(PIN_SERVO, 500, 2400);
  servoJanela.write(0);

  conectar();
  Serial.printf("[SISTEMA] pronto - firmware %s (LDR %s, HC-SR04 %s)\n", BLYNK_FIRMWARE_VERSION,
                USAR_LDR ? "ligado" : "desligado", USAR_HCSR04 ? "ligado" : "desligado");
  Serial.println("[PIR] aquecendo (~60 s) - leituras ignoradas");
}

void loop() {
  atualizarOTA();                 // Blynk.Air e ArduinoOTA (ver ota.h)
  if (Blynk.connected()) Blynk.run();
  manterConexao();
  verificarBotao();
  verificarPresenca();

#if USAR_LDR
  if (millis() >= proximaLeituraLdr) {
    proximaLeituraLdr = millis() + INTERVALO_LDR_MS;
    lerLuminosidade();
  }
#endif

#if USAR_HCSR04
  if (millis() >= proximaMedicaoDistancia) {
    proximaMedicaoDistancia = millis() + INTERVALO_DISTANCIA_MS;
    medirDistancia();
  }
#endif

  if (millis() >= proximaLeituraDht) {
    proximaLeituraDht = millis() + INTERVALO_DHT_MS;
    lerTemperaturaUmidade();
  }
}
