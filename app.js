import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __filename =
  typeof import.meta !== "undefined" && import.meta.url ? fileURLToPath(import.meta.url) : process.argv[1];
const __dirname = path.dirname(__filename);

function manageProcessPID() {
  const filePath = path.join(__dirname, "./modules/pid.log");

  try {
    if (fs.existsSync(filePath)) {
      const pidContent = fs.readFileSync(filePath, "utf8").trim();

      if (pidContent && !isNaN(pidContent)) {
        const oldPID = parseInt(pidContent, 10);
        try {
          process.kill(oldPID, "SIGTERM");
          consoleLogColor(`Processo anterior (PID: ${oldPID}) encerrado.`, ConsoleColors.YELLOW);
        } catch (err) {
          // consoleLogColor(`Falha ao encerrar o processo anterior (PID: ${oldPID}):`, ConsoleColors.RED);
        }
      }
    }

    fs.writeFileSync(filePath, process.pid.toString(), "utf8");
  } catch (err) {
    // console.error("Erro ao gerenciar o PID:", err);
  }
}
manageProcessPID();
import readline from "readline";
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestWaWebVersion,
  DisconnectReason,
} from "@whiskeysockets/baileys";
import { ConsoleColors, ImageAspects, SendMethods, TargetNumberSuffix } from "./modules/constants.js";
import { consoleLogColor, fetchWhatsAppVersion, deepEqual } from "./modules/utils.js";
import { showMainMenu } from "./modules/menu.js";
import { Config, saveConfig, SessionStats } from "./modules/config.js";
import { updateGroupStatistics, getStatistics, startupAllGroups } from "./modules/statistics.js";
import sharp from "sharp";
import pino from "pino";

const appDirectoryName = path.basename(process.cwd());
process.stdout.write(`\x1b]2;${appDirectoryName} - ${Config.OWN_NUMBER}\x07`);

let rl;
let reconnectionAttempts = Config.MAX_RECONNECTION_ATTEMPTS || 1;
let MessagePool = [];
let lastGroupIndex = 0;
let GroupMetadataCache = {};
let isSending = false;
let sock;
let state, saveCreds, currentVersion;

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

async function clearOldFiles(directory, retentionDays) {
  const dirPath = path.resolve(directory);

  try {
    const files = await fs.promises.readdir(dirPath);

    if (files.length === 0) {
      // consoleLogColor("Nenhum arquivo encontrado no diretório.", ConsoleColors.YELLOW);
      return;
    }

    const filesStats = await Promise.all(
      files.map(async (file) => {
        const filePath = path.resolve(dirPath, file);
        const fileStat = await fs.promises.stat(filePath);
        return { path: filePath, mtime: fileStat.mtime };
      })
    );

    const mostRecentFile = filesStats.reduce((latest, current) => {
      return current.mtime > latest.mtime ? current : latest;
    });

    const mostRecentDate = mostRecentFile.mtime;
    const retentionLimit = new Date(mostRecentDate);
    retentionLimit.setDate(retentionLimit.getDate() - retentionDays);

    if (mostRecentDate < retentionLimit) {
      // consoleLogColor("O arquivo mais recente já é considerado antigo. Nenhum arquivo removido.", ConsoleColors.YELLOW);
      return;
    }

    const filesToRemove = filesStats.filter((file) => file.mtime < retentionLimit);

    if (filesToRemove.length > 0) {
      await Promise.all(
        filesToRemove.map(async (file) => {
          await fs.promises.unlink(file.path);
        })
      );
      consoleLogColor(`Limpeza concluída. ${filesToRemove.length} arquivos de sessão expurgados.`, ConsoleColors.RESET);
    }
  } catch (error) {
    consoleLogColor(`Erro ao expurgar arquivos de sessão antigos: ${error}`, ConsoleColors.YELLOW);
  }
}

async function clearAllFiles(directory) {
  const dirPath = path.resolve(directory);
  try {
    const files = await fs.promises.readdir(dirPath);

    if (files.length === 0) {
      // consoleLogColor("Nenhum arquivo encontrado no diretório.", ConsoleColors.YELLOW);
      return true;
    }
    await Promise.all(
      files.map(async (file) => {
        const filePath = path.resolve(dirPath, file);
        const fileStat = await fs.promises.stat(filePath);

        if (fileStat.isDirectory()) {
          await fs.promises.rmdir(filePath, { recursive: true });
        } else {
          await fs.promises.unlink(filePath);
        }
      })
    );

    consoleLogColor(`${files.length} arquivos de sessão removidos.`, ConsoleColors.RESET);
    return true;
  } catch (error) {
    console.error(`Erro ao remover arquivos: ${error}`);
    return false;
  }
}

async function saveErrorLog(logMessage) {
  try {
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
    return v1;
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
    groupsObject[id] = rest;
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

  if (Config.GROUP_STATISTICS && ["add", "remove"].includes(groupUpdateData.action)) {
    updateGroupStatistics(groupUpdateData, group.subject, group.size);
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
        await delay(Config.DELAY_BETWEEN_GROUPS > 0 ? Config.DELAY_BETWEEN_GROUPS : 0);

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
        resolve();
      }
    });
  });

  await Promise.all(sendPromises);
}

function waitForQRGeneration() {
  return new Promise((resolve) => {
    rl.question("Pressione [ENTER] para ler novo QR Code...", () => {
      resolve();
    });
  });
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
      consoleLogColor(
        `Conexão fechada: ${lastDisconnect.error?.output?.statusCode} ${lastDisconnect.error?.message}`,
        ConsoleColors.RED
      );
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
          await clearOldFiles("./auth", 2);
          runWhatsAppBot();
        } catch (err) {
          consoleLogColor(`Erro durante reconexão:\n${err}`, ConsoleColors.RED);
        }
        return;
      } else if (
        lastDisconnect.error?.output?.statusCode == DisconnectReason.badSession ||
        lastDisconnect.error?.output?.statusCode == DisconnectReason.loggedOut
      ) {
        consoleLogColor("Removendo dados de sessão...", ConsoleColors.YELLOW);
        const authFilesRemoved = await clearAllFiles("./auth");
        if (authFilesRemoved) {
          consoleLogColor("Dados de sessão excluídos!", ConsoleColors.GREEN);
          consoleLogColor("❗ Será necessário autorizar o bot novamente.", ConsoleColors.YELLOW);
        } else {
          consoleLogColor("Erro ao remover dados de sessão!", ConsoleColors.RED);
          consoleLogColor(
            "❗ Exclua manualmente o diretório [auth] antes de autorizar novamente.",
            ConsoleColors.YELLOW
          );
        }

        await waitForQRGeneration();
        await sock.end();
        ({ state, saveCreds } = await useMultiFileAuthState("auth"));
        runWhatsAppBot();
        return;
      }
    } else if (connection === "open") {
      const newGroupMetadata = await sock.groupFetchAllParticipating();
      await createGroupMetadataCache(newGroupMetadata);
      consoleLogColor(`${SessionStats.totalGroups} grupos carregados.`, ConsoleColors.YELLOW);
      let totalParticipants = 0;
      const allGroupStartupInfo = [];
      for (const groupId in GroupMetadataCache) {
        const groupSize = GroupMetadataCache[groupId]?.size || 0;
        const groupName = GroupMetadataCache[groupId]?.subject || "";
        totalParticipants += groupSize;
        const groupStartupInfo = { groupId: groupId.replace("@g.us", ""), groupName, groupSize };
        allGroupStartupInfo.push(groupStartupInfo);
      }
      if (Config.GROUP_STATISTICS) {
        await startupAllGroups(allGroupStartupInfo);
      }
      consoleLogColor(`${totalParticipants} membros.`, ConsoleColors.YELLOW);

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

  sock.ev.on("creds.update", async () => {
    const userNumber = sock.user?.id?.match(/^\d+/)?.[0];

    if (userNumber) {
      if (!Config.OWN_NUMBER) {
        consoleLogColor(`Número do bot registrado: ${userNumber}`, ConsoleColors.GREEN);
        Config.OWN_NUMBER = userNumber;
        saveConfig();
      } else if (Config.OWN_NUMBER !== userNumber) {
        consoleLogColor(
          `❗ Novo número do bot registrado: ${userNumber} (anterior: ${Config.OWN_NUMBER})`,
          ConsoleColors.YELLOW
        );
        Config.OWN_NUMBER = userNumber;
        saveConfig();
      }
    }

    saveCreds();
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const waMessage of messages) {
      if (!waMessage.message) continue;

      const sender =
        waMessage.key && waMessage.key?.remoteJid?.endsWith("s.whatsapp.net")
          ? waMessage.key.remoteJid
          : waMessage.key.participant?.endsWith("s.whatsapp.net")
          ? waMessage.key.participant
          : "";

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
        } else if (messageContent && (messageContent.startsWith("stats") || messageContent.startsWith("+stats"))) {
          if (Config.GROUP_STATISTICS && /^(\+?stats)(\s([1-9]|1[0-9]|2[0-9]|30))?$/i.test(messageContent.trim())) {
            consoleLogColor(`Estatísticas solicitadas por: ${formattedNumber}`, ConsoleColors.YELLOW);

            const daysMatch = messageContent.trim().match(/^(\+?stats)\s?([1-9]|1[0-9]|2[0-9]|30)?$/i);
            const days = daysMatch && daysMatch[2] ? parseInt(daysMatch[2], 10) : 0;

            const isDetailed = messageContent.startsWith("+stats");

            const statsMessage = getStatistics(days, isDetailed);

            sendReportMessage(sock, sender, statsMessage, waMessage);
          }
        } else if (messageContent.length > 20 && messageContent.includes("http")) {
          {
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
        }
      } else if (waMessage.key.fromMe) {
        const key = {
          remoteJid: waMessage.key.remoteJid,
          id: waMessage.key.id,
          participant: waMessage?.participant || undefined,
        };
        await sock.readMessages([key]);
      }
      const key = {
        remoteJid: waMessage.key.remoteJid,
        id: waMessage.key.id,
        participant: waMessage?.participant || undefined,
      };
      await sock.readMessages([key]);
    }

    if (MessagePool.length > 0 && !isSending) {
      sendMessagesFromPool();
    }
  });

  sock.ev.on("groups.update", async (groupUpdateData) => {
    if (groupUpdateData?.length > 0) {
      for (const update of groupUpdateData) {
        const group = GroupMetadataCache[update?.id];
        if (group) {
          Object.assign(group, update);
        }
      }
    }
  });

  sock.ev.on("groups.upsert", async (groupUpsertGroupMetadata) => {
    const groupMetadataObj = convertGroupsArrayToObject(groupUpsertGroupMetadata);
    if (groupMetadataObj) {
      const key = Object.keys(groupMetadataObj)[0];
      const subject = groupMetadataObj[key]?.subject?.toLowerCase();
      consoleLogColor(`Bot adicionado ao grupo '${groupMetadataObj[key].subject}'`, ConsoleColors.YELLOW);
      if (Config.GROUP_NAME_KEYWORDS.some((keyword) => subject?.includes(keyword.toLowerCase()))) {
        consoleLogColor(`Grupo adicionado à lista de envios!`, ConsoleColors.GREEN);
        GroupMetadataCache = { ...GroupMetadataCache, ...groupMetadataObj };
      } else {
        consoleLogColor(`Grupo sem palavras-chave para a lista de envios!`, ConsoleColors.YELLOW);
      }
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

    function normalizeGroupName(groupName) {
      let normalized = groupName.toLowerCase();
      normalized = normalized.replace(/^[0-9]+\s*/, "");
      normalized = normalized.trim();
      normalized = normalized.replace(/\s+/g, "-");
      return normalized;
    }

    function modifyMessageLinks(messageContent, groupNameNormalized) {
      const domains = Config.LINK_TRACKING_DOMAINS || [];
      if (!messageContent || domains.length <= 0) return messageContent;
      const urlRegex = /https?:\/\/[^\s]+/g;

      return messageContent.replace(urlRegex, (url) => {
        try {
          const lowerUrl = url.toLowerCase();
          const domainFound = domains.find((d) => lowerUrl.includes(d.toLowerCase()));
          if (!domainFound) return url;

          const urlObj = new URL(url);

          urlObj.searchParams.set("utm_source", "whatsapp");
          urlObj.searchParams.set("utm_medium", groupNameNormalized);

          return urlObj.toString();
        } catch (e) {
          return url;
        }
      });
    }

    while (MessagePool.length > 0) {
      let currentSendMethod = Config.DEFAULT_SEND_METHOD;
      const waMessage = MessagePool.shift();

      const originalMessageContent = waMessage?.message?.extendedTextMessage?.text || waMessage.message?.conversation;
      let imageBuffer, thumbnailBufferBase64;

      if (currentSendMethod == SendMethods.IMAGE) {
        try {
          const urlMatch = originalMessageContent?.match(/https?:\/\/[^\s]+/);

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

          const responseImage = await fetch(imageUrl);
          const arrayBuffer = await responseImage.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          imageBuffer = await sharp(buffer)
            .resize(Config.IMAGE_ASPECT == ImageAspects.ORIGINAL ? 500 : 300, 300)
            .jpeg({ quality: 50 })
            .toBuffer();
          const thumbnailBuffer = await sharp(buffer)
            .resize(300, Config.IMAGE_ASPECT == ImageAspects.ORIGINAL ? 180 : 300)
            .jpeg({ quality: 50 })
            .toBuffer();
          thumbnailBufferBase64 = thumbnailBuffer.toString("base64");
        } catch (error) {
          if (error?.message?.includes("imagem:")) {
            consoleLogColor(error.message, ConsoleColors.RED);
          } else {
            consoleLogColor("Erro ao enviar como imagem!", ConsoleColors.RED);
          }
          consoleLogColor("Alterando método para encaminhamento.", ConsoleColors.YELLOW);
          currentSendMethod = SendMethods.FORWARD;
          await delay(5);
        }
      }

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

        const groupNameNormalized = normalizeGroupName(chat.subject);

        const finalContent = modifyMessageLinks(originalMessageContent, groupNameNormalized);

        try {
          switch (currentSendMethod) {
            case SendMethods.FORWARD:
              await handleSendMethod(() => {
                return sock.sendMessage(chat.id, { forward: waMessage });
              });

              break;

            case SendMethods.IMAGE:
              await handleImageSend(finalContent);
              break;

            default:
              await handleSendMethod(() => {
                return sock.sendMessage(chat.id, {
                  text: finalContent,
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

        async function handleImageSend(finalContentCaption) {
          await handleSendMethod(() => {
            return sock
              .sendMessage(chatId, {
                image: imageBuffer,
                caption: finalContentCaption,
                mimetype: "image/jpeg",
                jpegThumbnail: thumbnailBufferBase64,
              })
              .catch((error) => {
                throw new Error("Erro ao enviar imagem!");
              });
          });
        }

        async function handleError(error, waMessage) {
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

        if (chatId !== groupIds[groupIds.length - 1]) {
          const randomDelay = Config.DELAY_BETWEEN_GROUPS + (Math.random() * 2 - 1);
          await delay(randomDelay > 0 ? randomDelay : 0);
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
        await delay(randomDelay > 0 ? randomDelay : 0);
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

const startApp = async () => {
  await clearOldFiles("./auth", 2);

  ({ state, saveCreds } = await useMultiFileAuthState("auth"));
  currentVersion = await getWhatsAppVersion();
  setupInputListener();
  runWhatsAppBot();
};

startApp();
