import path from "path";
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
let GroupMetadataCache = {};
let isConnecting = false;

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

async function updateGroupMetadataCache(newGroupMetadata) {
  const filteredGroupMetadata = Object.keys(newGroupMetadata)
    .filter((key) => {
      const subject = newGroupMetadata[key].subject.toLowerCase();
      return Config.GROUP_NAME_KEYWORDS.some((keyword) => subject.includes(keyword.toLowerCase()));
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
    const { id, ...rest } = group; // Remove id
    groupsObject[id] = rest; // Store all without id
  });

  return groupsObject;
}

function handleGroupParticipantsUpdate(groupUpdateData) {
  const groupId = groupUpdateData.id;
  const group = GroupMetadataCache[groupId];

  if (!group) {
    console.error(`Grupo com id ${groupId} não encontrado no cache.`);
    return;
  }

  switch (groupUpdateData.action) {
    case "remove":
      group.participants = group.participants.filter(
        (participant) => !groupUpdateData.participants.includes(participant.id)
      );
      break;

    case "add":
      groupUpdateData.participants.forEach((participantId) => {
        group.participants.push({ id: participantId, admin: null });
      });
      break;

    case "promote":
      group.participants.forEach((participant) => {
        if (groupUpdateData.participants.includes(participant.id)) {
          participant.admin = "admin";
        }
      });
      break;

    case "demote":
      group.participants.forEach((participant) => {
        if (groupUpdateData.participants.includes(participant.id)) {
          participant.admin = null;
        }
      });
      break;

    case "modify":
      // Ignore so far.
      break;

    default:
      console.error(`Ação desconhecida: ${groupUpdateData.action}`);
      break;
  }
}

// Main function that controls the WhatsApp connection
async function runWhatsAppBot() {
  consoleLogColor("Iniciando a aplicação...", ConsoleColors.YELLOW, true);

  const sock = makeWASocket({
    auth: state,
    version: currentVersion,
    printQRInTerminal: true,
    logger: pino({ level: "silent" }),
    cachedGroupMetadata: async (jid) => {
      return GroupMetadataCache[jid];
    },
  });

  // WhatsApp connection
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "close") {
      consoleLogColor(`Conexão fechada devido ao erro: \n${lastDisconnect.error}`, ConsoleColors.RED);

      const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;

      if (shouldReconnect && reconnectionAttempts > 0) {
        reconnectionAttempts--;
        consoleLogColor(
          `Tentando reconectar...\nTentativa ${Config.MAX_RECONNECTION_ATTEMPTS - reconnectionAttempts} de ${
            Config.MAX_RECONNECTION_ATTEMPTS
          }`,
          ConsoleColors.YELLOW
        );
        try {
          sock?.ev?.removeAllListeners();
          await sock?.ws?.close();
          await delay(5);
          await runWhatsAppBot();
        } catch (err) {
          consoleLogColor(`Erro durante nova chamada de runWhatsAppBot:\n${err}`, ConsoleColors.RED);
        }
        return;
      } else {
        consoleLogColor("Máximo de tentativas de reconexão atingido.", ConsoleColors.RED);
        consoleLogColor("Encerrando a aplicação...", ConsoleColors.YELLOW);
        rl.close();
        process.exit(0);
      }
    } else if (connection === "open") {
      isConnecting = true;
      const newGroupMetadata = await sock.groupFetchAllParticipating();
      await updateGroupMetadataCache(newGroupMetadata);
      consoleLogColor(`${SessionStats.totalGroups} grupos carregados.`, ConsoleColors.YELLOW);

      if (Config.WA_VERSION != currentVersion) {
        Config.WA_VERSION = currentVersion;
        saveConfig();
      }
      reconnectionAttempts = Config.MAX_RECONNECTION_ATTEMPTS;
      consoleLogColor("👋 Bot inicializado e pronto.", ConsoleColors.GREEN);
      consoleLogColor(
        "--------------------------------------------------------------------------------\n",
        ConsoleColors.RESET,
        false
      );
      isConnecting = false;
      if (MessagePool.length > 0) {
        consoleLogColor(`Enviando ${MessagePool.length} mensagens acumuladas...`, ConsoleColors.YELLOW);
        sendMessagesFromPool();
      }
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

      if (!sender.endsWith("g.us")) {
        // if (Config.AUTHORIZED_NUMBERS.some((number) => sender.includes(number)) || waMessage.key.fromMe) {
        if (Config.AUTHORIZED_NUMBERS.some((number) => sender.includes(number))) {
          const formattedNumber = sender
            .replace(TargetNumberSuffix, "")
            .replace(/^(\d+)(\d{2})(\d{4})(\d{4})$/, (_, countryCode, areaCode, part1, part2) => {
              return `(${areaCode}) ${part1}-${part2}`;
            });
          const logMessage = `Mensagem ${waMessage.key.id} de: ${formattedNumber}`;
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

    if (MessagePool.length > 0 && !isSending && !isConnecting) {
      sendMessagesFromPool();
    }
  });

  sock.ev.on("groups.update", async (groupUpdateData) => {
    if (groupUpdateData?.length > 0) {
      const group = GroupMetadataCache[groupUpdateData[0].id];
      if (group) {
        group.subject = groupUpdateData.subject;
      }
    }
  });

  sock.ev.on("groups.upsert", async (groupUpsertGroupMetadata) => {
    const groupMetadataObj = convertGroupsArrayToObject(groupUpsertGroupMetadata);
    if (groupMetadataObj) {
      GroupMetadataCache = groupMetadataObj;
    }
  });

  sock.ev.on("group-participants.update", async (groupUpdateData) => {
    handleGroupParticipantsUpdate(groupUpdateData);
  });

  async function sendMessagesFromPool() {
    if (MessagePool.length === 0) {
      consoleLogColor("Não há mensagens para enviar.", ConsoleColors.YELLOW);
      return;
    }

    if (Object.keys(GroupMetadataCache).length === 0) {
      consoleLogColor("Não há grupos para enviar mensagens.", ConsoleColors.YELLOW);
      return;
    }

    isSending = true;
    let forcedStop = false;
    while (MessagePool.length > 0 && !forcedStop) {
      let currentSendMethod = Config.DEFAULT_SEND_METHOD;
      const waMessage = MessagePool.shift();
      const groupIds = Object.keys(GroupMetadataCache); // Get all group IDs
      consoleLogColor(`Enviando mensagem ${waMessage.key.id} para ${groupIds.length} grupos...`, ConsoleColors.BRIGHT);
      for (let i = 0; i < groupIds.length && !forcedStop; i++) {
        // Use index to track remaining groups
        const chatId = groupIds[i];
        const chat = GroupMetadataCache[chatId];
        try {
          switch (currentSendMethod) {
            case SendMethods.FORWARD:
              try {
                const sendMessagePromise = sock.sendMessage(chat.id, { forward: waMessage });
                const timeoutPromise = new Promise((_, reject) =>
                  setTimeout(() => reject(new Error("Timeout")), 30000)
                );
                await Promise.race([sendMessagePromise, timeoutPromise]);
              } catch (error) {
                if (error.message === "Timeout") {
                  consoleLogColor(`Erro ao enviar mensagem ${waMessage.key.id} (tempo excedido)!`, ConsoleColors.RED);
                } else {
                  consoleLogColor(`Erro ao enviar mensagem!`, ConsoleColors.RED);
                }
                sock.ev.removeAllListeners();
                await sock.ws.close();
                MessagePool.unshift(waMessage);
                consoleLogColor("Mensagem devolvida para a fila", ConsoleColors.YELLOW);
                consoleLogColor("Forçando reconexão em 5 segundos...", ConsoleColors.YELLOW);
                // await delay(5);
                // runWhatsAppBot(); // Call the function to restart the bot
                forcedStop = true;
              }
              break;

            case SendMethods.IMAGE:
              try {
                const text = waMessage.message.extendedTextMessage.text;
                const urlMatch = text.match(/https?:\/\/[^\s]+/);
                if (urlMatch) {
                  const url = urlMatch[0];
                  const response = await fetch(url);
                  if (response?.ok) {
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
                consoleLogColor("Enviando como encaminhamento...", ConsoleColors.YELLOW);
                await sock.sendMessage(chat.id, { forward: waMessage });
                currentSendMethod = SendMethods.FORWARD;
              }
              break;

            default:
              await sock.sendMessage(chat.id, { text: waMessage.message.extendedTextMessage.text });
              break;
          }
          if (!forcedStop) {
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
          }
        } catch (error) {
          consoleLogColor(`Erro ao enviar mensagem para o grupo ${chat.subject}: ${error}`, ConsoleColors.RED);
          MessagePool.unshift(waMessage); // Put the message back at the beginning
          return;
        }

        // Check if there's a next group before pausing
        if (!forcedStop && chatId !== groupIds[groupIds.length - 1]) {
          const randomDelay = Config.DELAY_BETWEEN_GROUPS + (Math.random() * 2 - 1);
          await delay(randomDelay);
        }
      }

      if (forcedStop) break;

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
    if (forcedStop) {
      return false;
    } else {
      consoleLogColor("", ConsoleColors.RESET, false);
      consoleLogColor("✅ Todas as mensagens foram enviadas.\n", ConsoleColors.GREEN);
    }
  }
}

setupInputListener();
runWhatsAppBot();
