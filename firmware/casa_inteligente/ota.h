/*
  Atualização do firmware pelo Wi-Fi (sem cabo USB)
  -------------------------------------------------
  1) Blynk.Air  — funciona de qualquer lugar com internet (inclusive na faculdade,
                  com a placa no Wi-Fi do celular). Você sobe o .bin no Blynk.Console
                  (Developer Zone → Blynk.Air → New Shipping) e a placa baixa sozinha.
  2) ArduinoOTA — envio direto do VS Code, mais rápido, mas o PC e a placa precisam
                  estar NA MESMA rede Wi-Fi (ex.: em casa).

  A lógica da casa não muda: este arquivo só adiciona os dois caminhos de atualização.
*/
#pragma once

#include <ArduinoOTA.h>
#include <ESP8266httpUpdate.h>
#include <WiFiClientSecureBearSSL.h>

#ifndef OTA_HOSTNAME
  #define OTA_HOSTNAME "casa-inteligente"
#endif

static String urlBlynkAir;          // preenchido quando o Blynk.Air manda atualizar
static bool arduinoOtaIniciado = false;

// O Blynk.Console avisa que há firmware novo enviando a URL do .bin neste pino interno.
// A atualização roda no loop() (fora do callback) para não travar a conexão.
BLYNK_WRITE(InternalPinOTA) {
  urlBlynkAir = param.asString();
  Serial.printf("[OTA] Blynk.Air: novo firmware disponível\n");
}

static void executarBlynkAir() {
  String url = urlBlynkAir;
  urlBlynkAir = "";

  Serial.println("[OTA] baixando firmware do Blynk.Air... (não desligue a placa)");
  noTone(PIN_BUZZER);
  Blynk.disconnect();                       // libera memória para o download

  ESPhttpUpdate.rebootOnUpdate(true);
  ESPhttpUpdate.onProgress([](int atual, int total) {
    static int ultimo = -10;
    int pct = total > 0 ? (atual * 100) / total : 0;
    if (pct - ultimo >= 10) { Serial.printf("[OTA] %d%%\n", pct); ultimo = pct; }
  });

  t_httpUpdate_return r;
  if (url.startsWith("https")) {
    BearSSL::WiFiClientSecure cliente;
    cliente.setInsecure();                  // sem verificação de certificado (simplificação didática)
    r = ESPhttpUpdate.update(cliente, url);
  } else {
    WiFiClient cliente;
    r = ESPhttpUpdate.update(cliente, url);
  }

  // Se der certo a placa reinicia sozinha e nem chega aqui.
  if (r == HTTP_UPDATE_FAILED) {
    Serial.printf("[OTA] falhou: %s\n", ESPhttpUpdate.getLastErrorString().c_str());
  } else if (r == HTTP_UPDATE_NO_UPDATES) {
    Serial.println("[OTA] nenhuma atualização");
  }
  Blynk.connect(5000);
}

static void iniciarArduinoOTA() {
  ArduinoOTA.setHostname(OTA_HOSTNAME);
#ifdef OTA_SENHA
  ArduinoOTA.setPassword(OTA_SENHA);
#endif
  ArduinoOTA.onStart([]() {
    noTone(PIN_BUZZER);
    Serial.println("[OTA] recebendo firmware pela rede local...");
  });
  ArduinoOTA.onEnd([]() { Serial.println("[OTA] concluído, reiniciando"); });
  ArduinoOTA.onError([](ota_error_t e) { Serial.printf("[OTA] erro %u\n", e); });
  ArduinoOTA.begin();
  arduinoOtaIniciado = true;
  Serial.printf("[OTA] pronto para receber em %s.local (%s)\n",
                OTA_HOSTNAME, WiFi.localIP().toString().c_str());
}

// Chamar no início do loop()
void atualizarOTA() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (!arduinoOtaIniciado) iniciarArduinoOTA();   // só depois que o Wi-Fi conectou
  ArduinoOTA.handle();
  if (urlBlynkAir.length()) executarBlynkAir();
}
