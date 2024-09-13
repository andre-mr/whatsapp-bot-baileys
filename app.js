import readline from "readline";
import { makeWASocket, useMultiFileAuthState, fetchLatestWaWebVersion } from "@whiskeysockets/baileys";
import { ConsoleColors, SendMethods, TargetNumberSuffix } from "./modules/constants.js";
import { consoleLogColor, fetchWhatsAppVersion } from "./modules/utils.js";
import { showMainMenu } from "./modules/menu.js";
import { Config, saveConfig, SessionStats } from "./modules/config.js";
import pino from "pino";

let rl;
let reconnectionAttempts = Config.MAX_RECONNECTION_ATTEMPTS || 1;
let MessagePool = [];

const { state, saveCreds } = await useMultiFileAuthState("auth");
const currentVersion = await getWhatsAppVersion();

async function getWhatsAppVersion() {
  const latestVersionBaileys = await fetchLatestWaWebVersion();
  const latestVersionCustom = await fetchWhatsAppVersion();
  const configVersion = Config.WA_VERSION || [];
  const compareVersions = (v1, v2, v3) => {
    for (let i = 0; i < 3; i++) {
      if (v1[i] > v2[i] && v1[i] > v3[i]) return v1;
      if (v2[i] > v1[i] && v2[i] > v3[i]) return v2;
      if (v3[i] > v1[i] && v3[i] > v2[i]) return v3;
    }
    return v1; // If all versions are equal, return the Config version
  };
  const currentVersion = compareVersions(configVersion, latestVersionBaileys.version || [], latestVersionCustom);

  if (!configVersion.every((v, i) => v === currentVersion[i])) {
    consoleLogColor(`Versão do WhatsApp: ${currentVersion.join(".")}`, ConsoleColors.CYAN, false);
    consoleLogColor("Versão do WhatsApp atualizada. Salvando nova configuração...", ConsoleColors.YELLOW);
    Config.WA_VERSION = currentVersion;
    saveConfig();
  }
  return currentVersion;
}

function createReadline() {
  if (!rl) {
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }
  return rl;
}

function setupInputListener() {
  if (!rl) rl = createReadline();

  rl.on("line", async (input) => {
    if (input.toLowerCase().trim() === "sair") {
      consoleLogColor("Encerrando a aplicação...", ConsoleColors.YELLOW);
      rl.close();
      consoleLogColor("Aplicação encerrada com sucesso.", ConsoleColors.GREEN);
      process.exit(0);
    } else if (input.toLowerCase().trim() === "menu") {
      rl.pause();
      await showMainMenu(rl);
      rl.resume();
    } else {
      consoleLogColor(`Comando inválido. Digite "menu" ou "sair"`, ConsoleColors.RED, false);
    }
  });
}

function delay(seconds) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

// Main function that controls the WhatsApp connection
async function runWhatsAppBot() {
  consoleLogColor("Iniciando a aplicação...", ConsoleColors.YELLOW, true);
  const sock = makeWASocket({
    auth: state,
    version: currentVersion,
    printQRInTerminal: true,
    logger: pino({ level: "fatal" }),
  });

  // WhatsApp connection
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "close") {
      consoleLogColor(`Conexão fechada devido ao erro: \n${lastDisconnect.error}`, ConsoleColors.RED);

      if (reconnectionAttempts > 0) {
        reconnectionAttempts--;
        consoleLogColor(
          `Tentando reconectar...\nTentativa ${Config.MAX_RECONNECTION_ATTEMPTS - reconnectionAttempts} de ${
            Config.MAX_RECONNECTION_ATTEMPTS
          }`,
          ConsoleColors.YELLOW
        );
        await delay(1);
        sock.ev.removeAllListeners();
        runWhatsAppBot();
        return;
      } else {
        consoleLogColor("Máximo de tentativas de reconexão atingido.", ConsoleColors.RED);
        consoleLogColor("Encerrando a aplicação...", ConsoleColors.YELLOW);
        rl.close();
        process.exit(0);
      }
    } else if (connection === "open") {
      reconnectionAttempts = Config.MAX_RECONNECTION_ATTEMPTS;
      consoleLogColor("👋 Bot inicializado e pronto.", ConsoleColors.GREEN);
      consoleLogColor(
        "--------------------------------------------------------------------------------",
        ConsoleColors.RESET,
        false
      );
    }
  });

  // Save user credentials
  sock.ev.on("creds.update", saveCreds);

  let isSending = false;

  // Receive messages from WhatsApp
  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const waMessage of messages) {
      if (!waMessage.message) continue; // Ignore messages without content

      const sender = waMessage.key.remoteJid;

      if (Config.AUTHORIZED_NUMBERS.some((number) => sender.includes(number)) && !waMessage.key.fromMe) {
        const formattedNumber = sender
          .replace(TargetNumberSuffix, "")
          .replace(/^(\d+)(\d{2})(\d{4})(\d{4})$/, (_, countryCode, areaCode, part1, part2) => {
            return `(${areaCode}) ${part1}-${part2}`;
          });
        const logMessage = `Mensagem de número autorizado: ${formattedNumber}`;
        consoleLogColor(logMessage, ConsoleColors.YELLOW);
        const messageExists =
          MessagePool.length > 0 &&
          MessagePool.some(
            (existingMessage) =>
              existingMessage.key.id === waMessage.key.id && existingMessage.key.remoteJid === waMessage.key.remoteJid
          );
        if (!messageExists) {
          MessagePool.push(waMessage);
        }
      } else {
        // Check if the message is from a group
        if (sender.endsWith("@g.us")) {
          if (!Config.AUTHORIZED_GROUPS.some((group) => group.id === sender)) {
            const groupMetadata = await sock.groupMetadata(waMessage.key.remoteJid);
            const groupObject = { id: groupMetadata.id, subject: groupMetadata.subject };

            const hasKeyword = Config.GROUP_NAME_KEYWORDS.some((keyword) => groupObject.subject.includes(keyword));
            const amIGroupOwner = groupMetadata.owner?.includes(Config.OWN_NUMBER);

            const shouldAddGroup = hasKeyword || amIGroupOwner;
            if (shouldAddGroup) {
              consoleLogColor("Mensagem de novo grupo que atende os requisitos.", ConsoleColors.YELLOW);
              Config.AUTHORIZED_GROUPS.push(groupObject);
              Config.AUTHORIZED_GROUPS.sort((a, b) => a.subject.localeCompare(b.subject));
              consoleLogColor(`Novo grupo adicionado: ${groupMetadata.subject}`, ConsoleColors.GREEN);
              saveConfig();
            }
          }
        }

        const key = {
          remoteJid: waMessage.key.remoteJid,
          id: waMessage.key.id,
          participant: waMessage.key.participant,
        };
        await sock.readMessages([key]);
      }
    }

    if (MessagePool.length > 0 && !isSending) {
      sendMessagesFromPool();
    }
  });

  async function sendMessagesFromPool() {
    if (MessagePool.length === 0) {
      consoleLogColor("Não há mensagens para enviar.", ConsoleColors.YELLOW);
      return;
    }

    if (Config.AUTHORIZED_GROUPS.length === 0) {
      consoleLogColor("Não há grupos para enviar mensagens.", ConsoleColors.YELLOW);
      return;
    }

    isSending = true;
    while (MessagePool.length > 0) {
      const waMessage = MessagePool.shift();
      for (let i = 0; i < Config.AUTHORIZED_GROUPS.length; i++) {
        const chat = Config.AUTHORIZED_GROUPS[i];
        try {
          switch (Config.DEFAULT_SEND_METHOD) {
            case SendMethods.FORWARD:
              await sock.sendMessage(chat.id, { forward: waMessage });
              break;

            case SendMethods.IMAGE:
              try {
                const text = waMessage.message.extendedTextMessage.text;
                const urlMatch = text.match(/https?:\/\/[^\s]+/);
                if (urlMatch) {
                  const url = urlMatch[0];
                  const response = await fetch(url);
                  if (response.ok) {
                    const html = await response.text();
                    const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
                    if (ogImageMatch) {
                      const imageUrl = ogImageMatch[1];
                      await sock.sendMessage(chat.id, {
                        image: { url: imageUrl },
                        caption: text,
                      });
                    } else {
                      throw new Error("URL da imagem não encontrada!");
                    }
                  } else {
                    throw new Error("Falha ao buscar a imagem!");
                  }
                } else {
                  throw new Error("Nenhuma URL encontrada na mensagem!");
                }
              } catch (error) {
                consoleLogColor(`Erro ao processar imagem: ${error.message}`, ConsoleColors.RED);
                consoleLogColor("Enviando como texto...", ConsoleColors.YELLOW);
                await sock.sendMessage(chat.id, { text: waMessage.message.extendedTextMessage.text });
              }

              break;
            default:
              await sock.sendMessage(chat.id, { text: waMessage.message.extendedTextMessage.text });
              break;
          }
          consoleLogColor(
            `Mensagem enviada para o grupo: [${chat.subject}] - ${
              Config.AUTHORIZED_GROUPS.length - i - 1
            } grupos restantes`,
            ConsoleColors.RESET
          );
        } catch (error) {
          consoleLogColor(`Erro ao enviar mensagem para o grupo ${chat.subject}: ${error}`, ConsoleColors.RED);
          MessagePool.unshift(waMessage); // Put the message back at the beginning
          return;
        }

        // Check if there's a next group before pausing
        if (i < Config.AUTHORIZED_GROUPS.length - 1) {
          const randomDelay = Config.DELAY_BETWEEN_GROUPS + (Math.random() * 2 - 1);
          await delay(randomDelay);
        }
      }

      const key = {
        remoteJid: waMessage.key.remoteJid,
        id: waMessage.key.id,
        participant: waMessage.key.participant,
      };
      await sock.readMessages([key]);

      SessionStats.totalMessagesSent++;
      if (MessagePool.length > 0) {
        const randomDelay = Config.DELAY_BETWEEN_MESSAGES + (Math.random() * 3 - 1);
        consoleLogColor("", ConsoleColors.RESET, false);
        consoleLogColor(`📩 Mensagens restantes: ${MessagePool.length}`, ConsoleColors.BRIGHT);
        consoleLogColor(`⏳ Pausa de ${randomDelay.toFixed(2)} segundos entre mensagens...\n`, ConsoleColors.RESET);
        await delay(randomDelay);
      }
    }

    isSending = false;
    consoleLogColor("", ConsoleColors.RESET, false);
    consoleLogColor("✅ Todas as mensagens foram enviadas.", ConsoleColors.GREEN);
  }
}

setupInputListener();
runWhatsAppBot();
