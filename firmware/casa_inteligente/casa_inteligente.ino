/*
  MINI CASA INTELIGENTE — NodeMCU ESP8266 + Blynk

  Componentes usados:
  - NodeMCU ESP8266
  - DHT11
  - Sensor de presenca PIR HC-SR501
  - Microservo SG90
  - 2 LEDs com resistores de 220 ohms
  - Buzzer
  - Botao

  Pinos virtuais Blynk:
  V0  = luz
  V1  = porta
  V2  = janela
  V3  = modo automatico
  V4  = temperatura
  V5  = umidade
  V7  = status da janela
  V8  = status do alarme
  V9  = armar/desarmar alarme
  V11 = presenca
*/

// Token do Blynk, Wi-Fi e senha do OTA ficam em secrets.h (fora do git).
// Copie secrets.example.h para secrets.h e preencha.
#include "secrets.h"

// Suba este número a cada versão enviada pelo Blynk.Air (formato X.Y.Z)
#define BLYNK_FIRMWARE_VERSION "1.0.0"
#define BLYNK_PRINT Serial

#include <ESP8266WiFi.h>
#include <BlynkSimpleEsp8266.h>
#include <DHT.h>
#include <Servo.h>

// Pinagem do NodeMCU
#define PIN_DHT        D2
#define PIN_PIR        D5
#define PIN_BOTAO      D6
#define PIN_SERVO      D7
#define PIN_LED_LUZ    D1
#define PIN_LED_PORTA  D0
#define PIN_BUZZER     D8

#define TIPO_DHT DHT11

#include "ota.h"   // atualização pelo Wi-Fi (Blynk.Air e ArduinoOTA)

DHT dht(PIN_DHT, TIPO_DHT);
Servo servoJanela;

const float TEMP_ABRIR_JANELA = 30.0;
const float TEMP_FECHAR_JANELA = 27.0;
const unsigned long DURACAO_ALARME_MS = 4000;
const unsigned long INTERVALO_DHT_MS = 2500;
const unsigned long DEBOUNCE_BOTAO_MS = 50;

bool modoAutomatico = true;
bool alarmeArmado = false;
bool alarmeTocando = false;
bool presenca = false;
bool luzLigada = false;
bool portaDestrancada = false;
int anguloJanela = 0;
float ultimaTemperatura = NAN;
float ultimaUmidade = NAN;

bool ultimaLeituraBotao = HIGH;
bool estadoEstavelBotao = HIGH;
unsigned long instanteMudancaBotao = 0;
unsigned long alarmeLigadoDesde = 0;
unsigned long proximaLeituraDht = 0;
unsigned long proximaReconexao = 0;

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
}

void controlarLuz(bool ligar) {
  luzLigada = ligar;
  digitalWrite(PIN_LED_LUZ, ligar ? HIGH : LOW);
  if (Blynk.connected()) Blynk.virtualWrite(V0, ligar);
  Serial.printf("[LUZ] %s\n", ligar ? "LIGADA" : "DESLIGADA");
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

void verificarPresenca() {
  bool presencaAgora = digitalRead(PIN_PIR) == HIGH;

  if (presencaAgora != presenca) {
    presenca = presencaAgora;
    Serial.printf("[PIR] presenca: %s\n", presenca ? "SIM" : "NAO");

    if (Blynk.connected()) Blynk.virtualWrite(V11, presenca);

    // No modo automatico, a luz acompanha o sensor de presenca.
    if (modoAutomatico) controlarLuz(presenca);
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

BLYNK_CONNECTED() {
  Serial.println("[BLYNK] conectado");
  Blynk.syncVirtual(V3, V9);
  publicarEstados();
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

  digitalWrite(PIN_LED_LUZ, LOW);
  digitalWrite(PIN_LED_PORTA, LOW);
  digitalWrite(PIN_BUZZER, LOW);

  dht.begin();

  servoJanela.attach(PIN_SERVO, 500, 2400);
  servoJanela.write(0);

  conectar();
  Serial.printf("[SISTEMA] pronto - firmware %s\n", BLYNK_FIRMWARE_VERSION);
}

void loop() {
  atualizarOTA();                 // Blynk.Air e ArduinoOTA (ver ota.h)
  if (Blynk.connected()) Blynk.run();
  manterConexao();
  verificarBotao();
  verificarPresenca();

  if (millis() >= proximaLeituraDht) {
    proximaLeituraDht = millis() + INTERVALO_DHT_MS;
    lerTemperaturaUmidade();
  }
}
