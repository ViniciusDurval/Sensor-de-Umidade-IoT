#include <WiFi.h>
#include <ESPAsyncWebServer.h>

const char* ssid = "redewifi";
const char* password = "senhadarede";

#define PINO_SENSOR 32  
#define PINO_RELE 25

// Controle do Dashboard
int umidadeAtual = 0;
int limiarIrrigacao = 40; // Valor padrão inicial (40%)

// Controle do WebSocket
unsigned long tempoAnteriorWS = 0;
const long intervaloEnvioWS = 2000; // 2 segundos

// Constantes de Calibração do Sensor 
const int VALOR_SECO = 4095;  
const int VALOR_MOLHADO = 1200;

enum EstadoSistema { 
  LENDO, 
  REGANDO, 
  PAUSA 
};
EstadoSistema estadoAtual = LENDO;

unsigned long timerIrrigacao = 0;
const unsigned long TEMPO_DE_REGA = 5000;
const unsigned long TEMPO_DE_PAUSA = 5000; // Tempo aguardando a água infiltrar na terra

// Criação do Servidor e do WebSocket
AsyncWebServer server(80);
AsyncWebSocket ws("/ws");

void onEvent(AsyncWebSocket *server, AsyncWebSocketClient *client, AwsEventType type,
             void *arg, uint8_t *data, size_t len) {
  if (type == WS_EVT_DATA) {
    AwsFrameInfo *info = (AwsFrameInfo*)arg;
    if (info->final && info->index == 0 && info->len == len && info->opcode == WS_TEXT) {
      data[len] = 0;
      String mensagem = (char*)data;
      
      // Recebendo o limiar pelo dashboard (ex: "50")
      limiarIrrigacao = mensagem.toInt();
      Serial.print("Novo limiar de irrigação recebido da Web: ");
      Serial.print(limiarIrrigacao);
      Serial.println("%");
    }
  }
}

void setup() {
  Serial.begin(115200);
  
  pinMode(PINO_RELE, OUTPUT);
  digitalWrite(PINO_RELE, LOW);
  
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWi-Fi Conectado!");
  Serial.print("Endereço IP da ESP32: ");
  Serial.println(WiFi.localIP());

  ws.onEvent(onEvent);
  server.addHandler(&ws);

  server.begin();
}

void loop() {
  ws.cleanupClients(); // Limpa conexões WebSocket mortas

  unsigned long tempoAtual = millis();

  // Lógica de Estados

  if (estadoAtual == LENDO) {
    int leituraBruta = analogRead(PINO_SENSOR);
    umidadeAtual = map(leituraBruta, VALOR_SECO, VALOR_MOLHADO, 0, 100);
    umidadeAtual = constrain(umidadeAtual, 0, 100);

    if (umidadeAtual < limiarIrrigacao) {
      digitalWrite(PINO_RELE, HIGH);
      estadoAtual = REGANDO;
      timerIrrigacao = tempoAtual; 
      Serial.println("Iniciando rega...");
    }
  } 
  else if (estadoAtual == REGANDO) {
    if (tempoAtual - timerIrrigacao >= TEMPO_DE_REGA) {
      digitalWrite(PINO_RELE, LOW);
      estadoAtual = PAUSA;          
      timerIrrigacao = tempoAtual;
      Serial.println("Rega concluída, aguardando infiltração...");
    }
  } 
  else if (estadoAtual == PAUSA) {
    if (tempoAtual - timerIrrigacao >= TEMPO_DE_PAUSA) {
      estadoAtual = LENDO;
      Serial.println("Voltando a monitorar o solo.");
    }
  }

  // Enviando dados pra o dashboard
  if (tempoAtual - tempoAnteriorWS >= intervaloEnvioWS) {
    tempoAnteriorWS = tempoAtual;
    
    bool bombaLigada = digitalRead(PINO_RELE);
    // Envia a umidade atual (mesmo que congelada durante a rega) e o status do relé
    String dadosParaEnviar = String(umidadeAtual) + "," + String(bombaLigada);
    
    ws.textAll(dadosParaEnviar);
  }
}