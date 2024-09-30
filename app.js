import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const appDirectoryName = path.basename(process.cwd());

import readline from "readline";
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestWaWebVersion,
  DisconnectReason,
} from "@whiskeysockets/baileys";
import { ConsoleColors, SendMethods, TargetNumberSuffix } from "./modules/constants.js";
import { consoleLogColor, fetchWhatsAppVersion, deepEqual } from "./modules/utils.js";
import { showMainMenu } from "./modules/menu.js";
import { Config, saveConfig, SessionStats } from "./modules/config.js";
import pino from "pino";

process.stdout.write(`\x1b]2;${appDirectoryName} - ${Config.OWN_NUMBER}\x07`);

let rl;
let reconnectionAttempts = Config.MAX_RECONNECTION_ATTEMPTS || 1;
let MessagePool = [];
let lastGroupIndex = 0;
let GroupMetadataCache = {};
let isSending = false;
let sock;

process.on("uncaughtException", async (error) => {
  const errorMessage = error?.message || "desconhecido";
  consoleLogColor(`Erro inesperado: ${errorMessage}`, ConsoleColors.RED);
  handleDisconnect();
  saveErrorLog(errorMessage);
});

process.on("unhandledRejection", async (reason) => {
  const reasonMessage = reason?.message || "desconhecido";
  consoleLogColor(`Erro não tratado: ${reasonMessage}`, ConsoleColors.RED);
  handleDisconnect();
  saveErrorLog(reasonMessage);
});

async function saveErrorLog(logMessage) {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const logFilePath = path.join(__dirname, "./modules/errors.log");
    const errorMessage = `[${new Date().toLocaleString()}] ${logMessage}\n`;

    fs.appendFile(logFilePath, errorMessage, (err) => {
      if (err) {
        consoleLogColor(`Erro ao salvar log: ${err.message}`, ConsoleColors.RED);
      }
    });
  } catch (err) {
    consoleLogColor("Erro ao salvar o arquivo de configuração: " + err, ConsoleColors.RED);
  }
}

function handleDisconnect(reconnectMessage) {
  if (sock && sock.ws.isOpen) {
    sock.end(new Error(reconnectMessage || "Fechamento manual"));
  }
}

const { state, saveCreds } = await useMultiFileAuthState("auth");
const currentVersion = await getWhatsAppVersion();

async function getWhatsAppVersion() {
  const latestVersionCustom = await fetchWhatsAppVersion();
  const latestVersionBaileys = await fetchLatestWaWebVersion();
  const configVersion = Config.WA_VERSION || [];
  const compareVersions = (v1, v2, v3) => {
    for (let i = 0; i < 3; i++) {
      if (v1[i] > v2[i] && v1[i] > v3[i]) return v1;
      if (v2[i] > v1[i] && v2[i] > v3[i]) return v2;
      if (v3[i] > v1[i] && v3[i] > v2[i]) return v3;
    }
    return v1; // If all versions are equal, return the Config version
  };
  const currentVersion = compareVersions(configVersion, latestVersionBaileys?.version || [], latestVersionCustom || []);

  if (!configVersion.every((v, i) => v === currentVersion[i])) {
    consoleLogColor(`Versão do WhatsApp: ${currentVersion.join(".")}`, ConsoleColors.CYAN, false);
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
      sock.ev.removeAllListeners();
      handleDisconnect();
      consoleLogColor("Aplicação encerrada com sucesso.", ConsoleColors.GREEN);
      process.exit(0);
    } else if (input.toLowerCase().trim() === "menu") {
      rl.pause();
      await showMainMenu(rl);
      rl.resume();
    } else {
      consoleLogColor(`Comando inválido. Digite "menu" ou "sair".`, ConsoleColors.RED, false);
    }
  });
}

function delay(seconds) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

async function createGroupMetadataCache(newGroupMetadata) {
  const filteredGroupMetadata = Object.keys(newGroupMetadata)
    .filter((key) => {
      const subject = newGroupMetadata[key].subject.toLowerCase();
      return Config.GROUP_NAME_KEYWORDS.some((keyword) => subject?.includes(keyword.toLowerCase()));
    })
    .sort((a, b) => {
      const subjectA = newGroupMetadata[a].subject.toLowerCase();
      const subjectB = newGroupMetadata[b].subject.toLowerCase();
      return subjectA.localeCompare(subjectB);
    })
    .reduce((result, key) => {
      result[key] = newGroupMetadata[key];
      return result;
    }, {});

  if (
    filteredGroupMetadata &&
    Object.keys(filteredGroupMetadata).length > 0 &&
    (Object.keys(GroupMetadataCache).length === 0 || !deepEqual(filteredGroupMetadata, GroupMetadataCache))
  ) {
    GroupMetadataCache = filteredGroupMetadata;
    SessionStats.totalGroups = Object.keys(GroupMetadataCache).length;
  }
}

function convertGroupsArrayToObject(groupsArray) {
  const groupsObject = {};

  groupsArray.forEach((group) => {
    const { id, ...rest } = group;
    groupsObject[id] = rest; // Store all without id
  });

  return groupsObject;
}

function handleGroupParticipantsUpdate(groupUpdateData) {
  const groupId = groupUpdateData?.id;
  const group = GroupMetadataCache[groupId];

  if (!group) {
    // Not a target group
    return;
  }

  switch (groupUpdateData.action) {
    case "remove":
      group.participants = group.participants.filter(
        (participant) => !groupUpdateData.participants?.includes(participant.id)
      );
      break;

    case "add":
      groupUpdateData.participants.forEach((participantId) => {
        group.participants.push({ id: participantId, admin: null });
      });
      break;

    case "promote":
      group.participants.forEach((participant) => {
        if (groupUpdateData.participants?.includes(participant.id)) {
          participant.admin = "admin";
        }
      });
      break;

    case "demote":
      group.participants.forEach((participant) => {
        if (groupUpdateData.participants?.includes(participant.id)) {
          participant.admin = null;
        }
      });
      break;

    case "modify":
      // No use yet, ignore so far.
      break;

    default:
      console.error(`Ação desconhecida: ${groupUpdateData.action}`);
      break;
  }
}

async function sendReportMessage(sock, recipientNumbers, content, quotedMessage) {
  if (!Array.isArray(recipientNumbers)) {
    recipientNumbers = [recipientNumbers];
  }
  const sendPromises = recipientNumbers.map(async (recipientNumber) => {
    let id = recipientNumber;
    if (!recipientNumber?.includes("whatsapp.net")) {
      id = `${recipientNumber}@s.whatsapp.net`;
    }

    return new Promise(async (resolve) => {
      try {
        await delay(Config.DELAY_BETWEEN_GROUPS || 1);

        const sendMessagePromise = quotedMessage
          ? sock.sendMessage(id, { text: content }, { quoted: quotedMessage })
          : sock.sendMessage(id, { text: content });
        const sendReportTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 30000));
        await Promise.race([sendMessagePromise, sendReportTimeout]);

        if (quotedMessage) {
          const key = {
            remoteJid: quotedMessage.key.remoteJid,
            id: quotedMessage.key.id,
            participant: undefined,
          };
          await sock.readMessages([key]);
        }

        resolve();
      } catch (error) {
        if (error?.message === "Timeout") {
          consoleLogColor(`Erro ao enviar mensagem para ${recipientNumber}: tempo excedido!`, ConsoleColors.RED);
        } else {
          consoleLogColor(`Erro ao enviar mensagem para ${recipientNumber}: ${error?.message}`, ConsoleColors.RED);
        }
        resolve(); // Resolve even on error to continue with other messages
      }
    });
  });

  await Promise.all(sendPromises);
}

// Main function that controls the WhatsApp connection
async function runWhatsAppBot() {
  consoleLogColor("Iniciando a aplicação...", ConsoleColors.BRIGHT, true);

  sock = makeWASocket({
    auth: state,
    version: currentVersion,
    printQRInTerminal: true,
    logger: pino({ level: "silent" }),
    cachedGroupMetadata: async (jid) => {
      return GroupMetadataCache[jid];
    },
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "close") {
      consoleLogColor(`Conexão fechada: ${lastDisconnect.error?.message}`, ConsoleColors.RED);
      isSending = false;

      const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;

      if (shouldReconnect) {
        if (lastDisconnect.error?.message?.includes("ENOTFOUND")) {
          consoleLogColor(`⏳ Conexão com o WhatsApp indisponível. Aguardando 60 segundos...`, ConsoleColors.YELLOW);
          await delay(60);
        } else {
          if (reconnectionAttempts > 0) {
            reconnectionAttempts--;
            consoleLogColor(
              `Tentando reconectar (tentativa ${Config.MAX_RECONNECTION_ATTEMPTS - reconnectionAttempts} de ${
                Config.MAX_RECONNECTION_ATTEMPTS
              })`,
              ConsoleColors.YELLOW
            );
            await delay(5);
          } else {
            consoleLogColor("Máximo de tentativas de reconexão atingido!", ConsoleColors.RED);
            consoleLogColor("Encerrando a aplicação...", ConsoleColors.YELLOW);
            sock.ev.removeAllListeners();
            rl.close();
            handleDisconnect();
            process.exit(0);
          }
        }

        try {
          await runWhatsAppBot();
        } catch (err) {
          consoleLogColor(`Erro durante reconexão:\n${err}`, ConsoleColors.RED);
        }
        return;
      }
    } else if (connection === "open") {
      const newGroupMetadata = await sock.groupFetchAllParticipating();
      await createGroupMetadataCache(newGroupMetadata);
      consoleLogColor(`${SessionStats.totalGroups} grupos carregados.`, ConsoleColors.YELLOW);

      if (Config.WA_VERSION != currentVersion) {
        Config.WA_VERSION = currentVersion;
        consoleLogColor("Versão do WhatsApp atualizada. Salvando nova configuração...", ConsoleColors.YELLOW);
        saveConfig();
      }
      reconnectionAttempts = Config.MAX_RECONNECTION_ATTEMPTS;
      consoleLogColor("👋 Bot inicializado e pronto.", ConsoleColors.GREEN);
      consoleLogColor(
        "--------------------------------------------------------------------------------\n",
        ConsoleColors.RESET,
        false
      );
      if (MessagePool.length > 0) {
        const messageCountText = MessagePool.length === 1 ? "mensagem acumulada" : "mensagens acumuladas";
        consoleLogColor(`Enviando ${MessagePool.length} ${messageCountText}...`, ConsoleColors.YELLOW);
        if (!isSending) {
          sendMessagesFromPool();
        }
      }
    }
  });

  // Save user credentials
  sock.ev.on("creds.update", saveCreds);

  // Receive messages from WhatsApp
  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const waMessage of messages) {
      if (!waMessage.message) continue; // Ignore messages without content

      const sender = waMessage.key.remoteJid;

      if (!sender.endsWith("g.us")) {
        if (Config.AUTHORIZED_NUMBERS.some((number) => sender?.includes(number)) && !waMessage.key.fromMe) {
          const formattedNumber = sender
            .replace(TargetNumberSuffix, "")
            .replace(/^(\d+)(\d{2})(\d{4})(\d{4})$/, (_, countryCode, areaCode, part1, part2) => {
              return `(${areaCode}) ${part1}-${part2}`;
            });

          const messageContent = waMessage.message?.conversation || waMessage?.message?.extendedTextMessage?.text;
          if (messageContent && /^(status|\?)$/i.test(messageContent.trim())) {
            consoleLogColor(`Status solicitado por: ${formattedNumber}`, ConsoleColors.YELLOW);
            const currentStatus = isSending
              ? MessagePool.length === 1
                ? `🔄 Enviando mensagem!\n1 restante na fila.`
                : `🔄 Enviando mensagem!\n${MessagePool.length} restantes na fila.`
              : "🟢 Online!\nAguardando novas mensagens.";
            const currentStatistics = `${
              SessionStats.totalMessagesSent === 1
                ? `${SessionStats.totalMessagesSent} mensagem enviada`
                : `${SessionStats.totalMessagesSent} mensagens enviadas`
            } desde o início da sessão em ${new Date(SessionStats.startTime).toLocaleString()}`;
            const statusReply = `${currentStatus}\n${currentStatistics}`;
            sendReportMessage(sock, sender, statusReply, waMessage);
          } else {
            consoleLogColor(`Mensagem ${waMessage.key.id} recebida de: ${formattedNumber}`, ConsoleColors.YELLOW);
            const messageExistsInPool =
              MessagePool.length > 0 &&
              MessagePool.some(
                (existingMessage) =>
                  existingMessage.key.id === waMessage.key.id &&
                  existingMessage.key.remoteJid === waMessage.key.remoteJid
              );
            if (!messageExistsInPool) {
              MessagePool.push(waMessage);
            }
          }
        } else if (waMessage.key.fromMe) {
          if (!Config.OWN_NUMBER) {
            const ownNumber = waMessage.key.remoteJid.replace("@s.whatsapp.net", "");
            consoleLogColor(`Número do bot registrado: ${ownNumber}`, ConsoleColors.GREEN);
            Config.OWN_NUMBER = ownNumber;
            saveConfig();
          }
          const key = {
            remoteJid: waMessage.key.remoteJid,
            id: waMessage.key.id,
            participant: waMessage?.participant || undefined, // participant if group only
          };
          await sock.readMessages([key]);
        }
      } else {
        const key = {
          remoteJid: waMessage.key.remoteJid,
          id: waMessage.key.id,
          participant: waMessage?.participant || undefined, // participant if group only
        };
        await sock.readMessages([key]);
      }
    }

    if (MessagePool.length > 0 && !isSending) {
      sendMessagesFromPool();
    }
  });

  sock.ev.on("groups.update", async (groupUpdateData) => {
    if (groupUpdateData?.length > 0) {
      for (const update of groupUpdateData) {
        const group = GroupMetadataCache[update.id];
        if (group) {
          Object.assign(group, update);
        }
      }
    }
  });

  sock.ev.on("groups.upsert", async (groupUpsertGroupMetadata) => {
    const groupMetadataObj = convertGroupsArrayToObject(groupUpsertGroupMetadata);
    if (groupMetadataObj) {
      GroupMetadataCache = { ...GroupMetadataCache, ...groupMetadataObj };
    }
  });

  sock.ev.on("group-participants.update", async (groupUpdateData) => {
    handleGroupParticipantsUpdate(groupUpdateData);
  });

  async function sendMessagesFromPool() {
    if (Object.keys(GroupMetadataCache).length === 0) {
      consoleLogColor("Não há grupos para enviar mensagens.", ConsoleColors.YELLOW);
      return;
    }

    isSending = true;
    let messagesSentInCurrentBatch = 0;

    while (MessagePool.length > 0) {
      let currentSendMethod = Config.DEFAULT_SEND_METHOD;
      const waMessage = MessagePool.shift();
      const groupIds = Object.keys(GroupMetadataCache);
      if (lastGroupIndex > 0) {
        consoleLogColor(
          `Enviando mensagem ${waMessage.key.id} para ${groupIds.length - lastGroupIndex} grupos restantes...`,
          ConsoleColors.BRIGHT
        );
      } else {
        consoleLogColor(
          `Enviando mensagem ${waMessage.key.id} para ${groupIds.length} grupos...`,
          ConsoleColors.BRIGHT
        );
      }

      for (let i = lastGroupIndex; i < groupIds.length; i++) {
        const chatId = groupIds[i];
        const chat = GroupMetadataCache[chatId];

        try {
          switch (currentSendMethod) {
            case SendMethods.FORWARD:
              await handleSendMethod(() => {
                return sock.sendMessage(chat.id, { forward: waMessage });
              });

              break;

            case SendMethods.IMAGE:
              await handleImageSend(waMessage, chat.id, sock);
              break;

            default:
              await handleSendMethod(() => {
                return sock.sendMessage(chat.id, {
                  text: waMessage?.message?.extendedTextMessage?.text || waMessage.message?.conversation,
                });
              });
              break;
          }
        } catch (error) {
          await handleError(error, waMessage);
        }

        async function handleSendMethod(sendFunction) {
          try {
            if (sock.ws.isOpen) {
              const sendPromise = sendFunction();
              const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 30000));
              await Promise.race([sendPromise, timeoutPromise]);
            } else {
              throw new Error("Sem conexão ao tentar enviar.");
            }
          } catch (error) {
            throw error;
          }
        }

        async function handleImageSend(waMessage, chatId, sock) {
          const text = waMessage?.message?.extendedTextMessage?.text || waMessage.message?.conversation;
          const urlMatch = text?.match(/https?:\/\/[^\s]+/);

          if (!urlMatch) {
            throw new Error("Erro ao preparar imagem: nenhuma URL na mensagem!");
          }

          const url = urlMatch[0];
          const response = await fetch(url);

          if (!response?.ok) {
            throw new Error("Erro ao preparar imagem: falha ao baixar!");
          }

          const html = await response.text();
          const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/);

          if (!ogImageMatch) {
            throw new Error("Erro ao preparar imagem: URL não encontrada!");
          }

          const imageUrl = ogImageMatch[1];
          await handleSendMethod(() => {
            return sock
              .sendMessage(chatId, {
                image: { url: imageUrl },
                caption: text,
              })
              .catch((error) => {
                throw new Error("Erro ao enviar imagem!");
              });
          });
        }

        async function handleError(error, waMessage) {
          if (error?.message?.includes("imagem:")) {
            consoleLogColor(error.message, ConsoleColors.RED);
            consoleLogColor("Alterando método para encaminhamento.", ConsoleColors.YELLOW);
            currentSendMethod = SendMethods.FORWARD;
            await delay(5);
          } else {
            if (error?.message == "Timeout" || error?.message == "Timed Out") {
              consoleLogColor(`Falha no envio da mensagem ${waMessage.key.id} - tempo excedido!`, ConsoleColors.RED);
            } else {
              consoleLogColor(error?.message || "Falha no envio!", ConsoleColors.RED);
            }
            const nextMessage = MessagePool[0];
            if (!nextMessage || nextMessage.key.id !== waMessage.key.id) {
              MessagePool.unshift(waMessage);
              consoleLogColor(`Mensagem ${waMessage.key.id} devolvida para a fila.`, ConsoleColors.BRIGHT);
            }
            isSending = false;
          }
        }

        if (!isSending) {
          if (i > 0 && i < groupIds.length) {
            lastGroupIndex = i;
          }
          return false;
        }

        consoleLogColor(
          `${
            currentSendMethod === SendMethods.FORWARD
              ? "Mensagem encaminhada"
              : currentSendMethod === SendMethods.IMAGE
              ? "Imagem enviada"
              : "Mensagem enviada"
          } para '${chat.subject}' - ${groupIds.length - i - 1} grupos restantes`,
          ConsoleColors.RESET
        );

        // Check if there's a next group before pausing
        if (chatId !== groupIds[groupIds.length - 1]) {
          const randomDelay = Config.DELAY_BETWEEN_GROUPS + (Math.random() * 2 - 1);
          await delay(randomDelay);
        }
      }

      lastGroupIndex = 0;

      const key = {
        remoteJid: waMessage.key.remoteJid,
        id: waMessage.key.id,
        participant: waMessage.key.participant,
      };
      await sock.readMessages([key]);

      messagesSentInCurrentBatch++;
      SessionStats.totalMessagesSent++;

      if (MessagePool.length > 0) {
        const randomDelay =
          Config.DELAY_BETWEEN_MESSAGES <= 10
            ? Config.DELAY_BETWEEN_MESSAGES + (Math.random() * 3 - 1)
            : Config.DELAY_BETWEEN_MESSAGES +
              (Math.random() * Config.DELAY_BETWEEN_MESSAGES * 0.2 * 2 - Config.DELAY_BETWEEN_MESSAGES * 0.2);
        consoleLogColor("", ConsoleColors.RESET, false);
        consoleLogColor(`📩 Mensagens restantes: ${MessagePool.length}`, ConsoleColors.RESET);
        consoleLogColor(`⏳ Pausa de ${randomDelay.toFixed(2)} segundos entre mensagens...\n`, ConsoleColors.RESET);
        await delay(randomDelay);
      }
    }

    isSending = false;
    const sendSuccessMessage = `✅ Lote de envios concluído!`;
    const sendSuccessMessageStats = `${messagesSentInCurrentBatch} ${
      messagesSentInCurrentBatch == 1 ? "mensagem enviada" : "mensagens enviadas"
    }.`;
    consoleLogColor("", ConsoleColors.RESET, false);
    consoleLogColor(`${sendSuccessMessage} ${sendSuccessMessageStats}\n`, ConsoleColors.GREEN);
    sendReportMessage(sock, Config.AUTHORIZED_NUMBERS, `${sendSuccessMessage}\n${sendSuccessMessageStats}`);
  }
}

setupInputListener();
runWhatsAppBot();
