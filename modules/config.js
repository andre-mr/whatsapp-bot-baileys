import fs from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { ConsoleColors, SendMethods } from "./constants.js";
import { consoleLogColor } from "./utils.js";

let Config = {};
const SessionStats = {
  startTime: new Date().toISOString(),
  totalMessagesSent: 0,
};

export function loadConfig() {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const configPath = join(__dirname, "./config.json");
    const data = fs.readFileSync(configPath, "utf8");
    Config = JSON.parse(data);
    consoleLogColor("Configurações carregadas com sucesso\n", ConsoleColors.GREEN);
    const configSummary = `Método de Envio Padrão: ${
      Config.DEFAULT_SEND_METHOD === SendMethods.FORWARD
        ? "Encaminhar"
        : Config.DEFAULT_SEND_METHOD === SendMethods.TEXT
        ? "Texto"
        : Config.DEFAULT_SEND_METHOD === SendMethods.IMAGE
        ? "Imagem"
        : "Desconhecido"
    }
Pausa entre Grupos: ${Config.DELAY_BETWEEN_GROUPS} segundos
Pausa entre Mensagens: ${Config.DELAY_BETWEEN_MESSAGES} segundos
Números Autorizados: ${Config.AUTHORIZED_NUMBERS.length}
Grupos Autorizados: ${Config.AUTHORIZED_GROUPS.length}
Palavras-chave para grupos: ${Config.GROUP_NAME_KEYWORDS.length}
Número do bot: "${Config.OWN_NUMBER}"
Versão do WhatsApp: "${Config.WA_VERSION.join(".")}"
`;
    consoleLogColor(configSummary, ConsoleColors.CYAN, false);
    return Config;
  } catch (err) {
    consoleLogColor("Erro ao carregar a configuração: " + err, ConsoleColors.RED);
    consoleLogColor("Carregando configurações padrão... ", ConsoleColors.YELLOW);
    Config = {
      AUTHORIZED_GROUPS: [],
      AUTHORIZED_NUMBERS: [],
      GROUP_NAME_KEYWORDS: [],
      DEFAULT_SEND_METHOD: SendMethods.FORWARD,
      DELAY_BETWEEN_GROUPS: 2,
      DELAY_BETWEEN_MESSAGES: 20,
      MAX_RECONNECTION_ATTEMPTS: 5,
      OWN_NUMBER: "",
      WA_VERSION: [2, 3000, 1015901307],
    };
    saveConfig();
    return Config;
  }
}

export function saveConfig() {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const configPath = join(__dirname, "./config.json");
    fs.writeFileSync(configPath, JSON.stringify(Config, null, 2), "utf8");
  } catch (err) {
    consoleLogColor("Erro ao salvar o arquivo de configuração: " + err, ConsoleColors.RED);
  }
}

export function showCurrentConfig() {
  const startDate = new Date(SessionStats.startTime);
  const currentDate = new Date();
  const diffTime = currentDate - startDate;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor((diffTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const diffMinutes = Math.floor((diffTime % (1000 * 60 * 60)) / (1000 * 60));
  const diffSeconds = Math.floor((diffTime % (1000 * 60)) / 1000);

  let timeText = "";

  if (diffDays > 0) {
    timeText += `${diffDays} ${diffDays === 1 ? "dia" : "dias"}`;
  }
  if (diffHours > 0) {
    timeText += (timeText ? ", " : "") + `${diffHours} ${diffHours === 1 ? "hora" : "horas"}`;
  }
  if (diffMinutes > 0) {
    timeText += (timeText ? ", " : "") + `${diffMinutes} ${diffMinutes === 1 ? "minuto" : "minutos"}`;
  }
  if (diffSeconds > 0) {
    timeText += (timeText ? " e " : "") + `${diffSeconds} ${diffSeconds === 1 ? "segundo" : "segundos"}`;
  }

  const configFormatted = `Sessão ativa desde: ${new Date(SessionStats.startTime).toLocaleString()} (${timeText})
Mensagens enviadas na sessão: ${SessionStats.totalMessagesSent}

Configurações atuais:

Método de envio padrão: "${
    Config.DEFAULT_SEND_METHOD === SendMethods.FORWARD
      ? "Encaminhar"
      : Config.DEFAULT_SEND_METHOD === SendMethods.TEXT
      ? "Texto"
      : Config.DEFAULT_SEND_METHOD === SendMethods.IMAGE
      ? "Imagem"
      : "Desconhecido"
  }"
Pausa entre grupos: ${Config.DELAY_BETWEEN_GROUPS} segundos
Pausa entre mensagens: ${Config.DELAY_BETWEEN_MESSAGES} segundos
Números autorizados: ${Config.AUTHORIZED_NUMBERS.map((num) => `"${num}"`).join(", ")}
Grupos autorizados: ${Config.AUTHORIZED_GROUPS.map((group) => `"${group.subject}"`).join(", ")}
Palavras-chave para grupos: ${Config.GROUP_NAME_KEYWORDS.map((keyword) => `"${keyword}"`).join(", ")}
Número do bot: "${Config.OWN_NUMBER}"
Versão do WhatsApp: "${Config.WA_VERSION.join(".")}"`;

  consoleLogColor(configFormatted, ConsoleColors.CYAN, false);
}

loadConfig();

export { Config, SessionStats };
