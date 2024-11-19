import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { consoleLogColor, formatMillisecondsToTime } from "./utils.js";
import { ConsoleColors } from "./constants.js";

/**
 * Função auxiliar para carregar e processar as estatísticas.
 * @returns {Object} Objeto contendo groupsById, datesToShow e maxGroupNameLength
 */
function loadAndProcessStatistics(days, reverse) {
  let daysToCalculate = days > 0 ? days : 1;
  const groupsStatisticsPath = path.join(__dirname, "./statistics.json");

  let groupsStatistics;
  try {
    const data = fs.readFileSync(groupsStatisticsPath, "utf8");
    groupsStatistics = JSON.parse(data);
  } catch (error) {
    throw new Error("Erro ao carregar arquivo de estatísticas!");
  }

  const today = new Date();
  const todayNormalized = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const maxDaysAgo = new Date(todayNormalized);
  maxDaysAgo.setDate(todayNormalized.getDate() - (daysToCalculate - 1));

  let datesToShow = [];
  if (reverse) {
    let currentDate = new Date(todayNormalized);
    for (let i = 0; i < daysToCalculate; i++) {
      datesToShow.push(currentDate.toISOString().split("T")[0]);
      currentDate.setDate(currentDate.getDate() - 1);
    }
  } else {
    let currentDate = new Date(maxDaysAgo);
    for (let i = 0; i < daysToCalculate; i++) {
      datesToShow.push(currentDate.toISOString().split("T")[0]);
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  if (days === 0) {
    const formattedToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
      today.getDate()
    ).padStart(2, "0")}`;
    datesToShow = datesToShow.includes(formattedToday) ? [formattedToday] : [];
  }

  const maxGroupNameLength = Math.max(
    ...groupsStatistics.flatMap((group) => Object.values(group)[0].group_name.length),
    20
  );

  const groupsById = groupsStatistics.reduce((acc, group) => {
    const groupId = Object.keys(group)[0];
    acc[groupId] = group[groupId];
    return acc;
  }, {});

  return { groupsById, datesToShow, maxGroupNameLength };
}

/**
 * Imprime as estatísticas no console com formatação de tabela.
 */
export function printStatistics() {
  let groupsById, datesToShow, maxGroupNameLength;
  try {
    const processed = loadAndProcessStatistics(30, false);
    groupsById = processed.groupsById;
    datesToShow = processed.datesToShow;
    maxGroupNameLength = processed.maxGroupNameLength;
  } catch (error) {
    consoleLogColor(error.message, ConsoleColors.RED, true, true);
    return;
  }

  const totalGroups = Object.keys(groupsById).length;
  let totalMonthAdd = 0;
  let totalMonthRemove = 0;
  let totalMonthDropout = 0;
  let totalParticipants = 0;
  let totalDropoutTime = 0;
  let totalDropoutCount = 0;

  for (const groupId in groupsById) {
    totalParticipants += groupsById[groupId]?.group_size || 0;
  }

  consoleLogColor("\nEstatísticas dos grupos:\n", ConsoleColors.YELLOW, false, true);

  datesToShow.forEach((date) => {
    let totalDayAdd = 0;
    let totalDayRemove = 0;
    let totalDayDropout = 0;
    let totalDayDropoutTime = 0;
    let totalDayDropoutTimeCount = 0;
    let hasGroupData = false;
    let dailyOutput = [];

    const formattedDate = date.split("-").reverse().join("/");

    let totalDateParticipants = 0;
    Object.keys(groupsById)
      .sort((a, b) => groupsById[a].group_name.localeCompare(groupsById[b].group_name))
      .forEach((groupId) => {
        const groupInfo = groupsById[groupId];
        const dailyStat = groupInfo.statistics.find((stat) => stat[date]);

        if (dailyStat) {
          totalDateParticipants += groupInfo.group_size || 0;
          const {
            add_count: addCount,
            remove_count: removeCount,
            dropout_count: dropoutCount,
            dropout_time: dropoutTime,
          } = dailyStat[date];

          if (dropoutTime > 0) {
            totalDayDropoutTime += dropoutTime;
            totalDayDropoutTimeCount++;
          }

          dailyOutput.push(
            ` ${groupInfo.group_name.padEnd(maxGroupNameLength)} | ${groupInfo.group_size
              .toString()
              .padEnd(7)} | ${addCount.toString().padEnd(8)} | ${removeCount.toString().padEnd(6)} | ${dropoutCount
              .toString()
              .padEnd(12)} | ${formatMillisecondsToTime(dropoutTime).padEnd(12)} | ${
              addCount - removeCount > 0 ? "+" : ""
            }${(addCount - removeCount).toString().padEnd(addCount - removeCount > 0 ? 4 : 5)} | ${
              addCount > 0 ? Math.floor(((addCount - dropoutCount) / addCount) * 100) : 0
            }%`
          );

          totalDayAdd += addCount;
          totalDayRemove += removeCount;
          totalDayDropout += dropoutCount;
          hasGroupData = true;
        }
      });

    if (hasGroupData) {
      const averageDayDropoutTime =
        totalDayDropout > 0 && totalDayDropoutTimeCount > 0 ? totalDayDropoutTime / totalDayDropoutTimeCount : 0;
      const formattedDayDropoutTime = formatMillisecondsToTime(averageDayDropoutTime);

      consoleLogColor(`\n📅 ${formattedDate}`, ConsoleColors.YELLOW, false, true);
      consoleLogColor("-".repeat(maxGroupNameLength + 80), ConsoleColors.RESET, false, true);
      consoleLogColor(
        " Grupo".padEnd(maxGroupNameLength + 2) +
          "| Membros | Entradas | Saídas | Desistências | Permanência | Saldo | Retenção",
        ConsoleColors.BRIGHT,
        false,
        true
      );
      consoleLogColor("-".repeat(maxGroupNameLength + 80), ConsoleColors.RESET, false, true);

      dailyOutput.forEach((line) => consoleLogColor(line, ConsoleColors.RESET, false, true));

      consoleLogColor("-".repeat(maxGroupNameLength + 80), ConsoleColors.RESET, false, true);
      consoleLogColor(
        " Totais do dia".padEnd(maxGroupNameLength + 2) +
          `| ${totalDateParticipants.toString().padEnd(7)} | ${totalDayAdd.toString().padEnd(8)} | ${totalDayRemove
            .toString()
            .padEnd(6)} | ${totalDayDropout.toString().padEnd(12)} | ${formattedDayDropoutTime.padEnd(12)} | ${
            totalDayAdd - totalDayRemove > 0
              ? ("+" + (totalDayAdd - totalDayRemove).toString()).padEnd(5)
              : (totalDayAdd - totalDayRemove).toString().padEnd(5)
          } | ${Math.floor(((totalDayAdd - totalDayDropout) / totalDayAdd) * 100)}%`,
        ConsoleColors.YELLOW,
        false,
        true
      );
      consoleLogColor("-".repeat(maxGroupNameLength + 80), ConsoleColors.RESET, false, true);

      totalMonthAdd += totalDayAdd;
      totalMonthRemove += totalDayRemove;
      totalMonthDropout += totalDayDropout;

      totalDropoutTime += averageDayDropoutTime;
      totalDropoutCount = totalDayDropout > 0 ? totalDropoutCount + 1 : totalDropoutCount;
    }
  });

  const totalMonthBalance = totalMonthAdd - totalMonthRemove;
  const labelWidth = 18;

  const formatLine = (label, value) => `${label.padEnd(labelWidth)}${value}`;

  consoleLogColor("\n============================", ConsoleColors.RESET, false, true);
  consoleLogColor("📊 Resumo 30 dias \n", ConsoleColors.BRIGHT, false, true);

  consoleLogColor(formatLine("🏠 Grupos:", totalGroups), ConsoleColors.BRIGHT, false, true);
  consoleLogColor(formatLine("👤 Membros:", totalParticipants), ConsoleColors.BRIGHT, false, true);

  consoleLogColor(`----------------------------`, ConsoleColors.BRIGHT, false, true);

  consoleLogColor(formatLine("🟢 Entradas:", totalMonthAdd), ConsoleColors.GREEN, false, true);
  consoleLogColor(formatLine("🔴 Saídas:", totalMonthRemove), ConsoleColors.RED, false, true);
  consoleLogColor(formatLine("🟡 Desistências:", totalMonthDropout), ConsoleColors.YELLOW, false, true);

  const averageTotalDropoutTime =
    totalDropoutCount > 0 ? formatMillisecondsToTime(totalDropoutTime / totalDropoutCount) : "-";
  consoleLogColor(formatLine(`⏱  Permanência:`, averageTotalDropoutTime), ConsoleColors.BRIGHT, false, true);

  consoleLogColor(`----------------------------`, ConsoleColors.BRIGHT, false, true);

  const balanceLabel = totalMonthBalance > 0 ? "🔼 Expansão:" : totalMonthBalance < 0 ? "🔽 Retração:" : "⚖️ Saldo:";
  consoleLogColor(
    formatLine(balanceLabel, totalMonthBalance > 0 ? `+${totalMonthBalance}` : totalMonthBalance),
    ConsoleColors.BRIGHT,
    false,
    true
  );

  consoleLogColor(
    formatLine(
      "🔒 Retenção:",
      `${totalMonthAdd > 0 ? Math.floor(((totalMonthAdd - totalMonthDropout) / totalMonthAdd) * 100) : 0}%`
    ),
    ConsoleColors.BRIGHT,
    false,
    true
  );

  consoleLogColor("============================\n", ConsoleColors.RESET, false, true);
}

/**
 * Retorna as estatísticas formatadas como uma string adequada para visualização no WhatsApp.
 * @param {number} days - Número de dias retroativos para processar (máximo 30, padrão 1).
 * @returns {string} String contendo as estatísticas formatadas.
 */
export function getStatistics(days, isDetailed) {
  if (!days || typeof days !== "number" || isNaN(days) || days < 0) {
    days = 0;
  } else if (days > 30) {
    days = 30;
  } else {
    days = Math.floor(days);
  }

  let groupsById, datesToShow;
  try {
    const processed = loadAndProcessStatistics(days, true);
    groupsById = processed.groupsById;
    datesToShow = processed.datesToShow;
  } catch (error) {
    return `❌ ${error.message}`;
  }

  const totalGroups = Object.keys(groupsById).length;
  let totalPeriodAdd = 0;
  let totalPeriodRemove = 0;
  let totalPeriodDropout = 0;
  let totalDropoutTime = 0;
  let totalDropoutCount = 0;
  let totalParticipants = 0;

  for (const groupId in groupsById) {
    totalParticipants += groupsById[groupId]?.group_size || 0;
  }

  let statisticsMessage = "";
  let hasAnyGroupData = false;

  datesToShow.forEach((date) => {
    let totalDayAdd = 0;
    let totalDayRemove = 0;
    let totalDayDropout = 0;
    let totalDayDropoutTime = 0;
    let totalDayDropoutTimeCount = 0;
    let hasGroupData = false;
    let dailyOutput = [];

    const formattedDate = date.split("-").reverse().join("/");

    let totalDateParticipants = 0;
    Object.keys(groupsById)
      .sort((a, b) => groupsById[a].group_name.localeCompare(groupsById[b].group_name))
      .forEach((groupId) => {
        const groupInfo = groupsById[groupId];
        const dailyStat = groupInfo.statistics.find((stat) => stat[date]);
        if (dailyStat) {
          totalDateParticipants += groupInfo.group_size || 0;
          const {
            add_count: addCount,
            remove_count: removeCount,
            dropout_count: dropoutCount,
            dropout_time: dropoutTime,
          } = dailyStat[date];
          const balance = addCount - removeCount;
          const retention = addCount > 0 ? Math.floor(((addCount - dropoutCount) / addCount) * 100) : 0;

          totalDayAdd += addCount;
          totalDayRemove += removeCount;
          totalDayDropout += dropoutCount;
          if (dropoutTime > 0) {
            totalDayDropoutTime += dropoutTime;
          }
          if (dropoutCount > 0) {
            totalDayDropoutTimeCount++;
          }
          hasGroupData = true;
          hasAnyGroupData = true;

          const formattedGroupDropoutTime = formatMillisecondsToTime(dropoutCount > 0 ? dropoutTime : 0);

          let balanceEmoji = "⚖️";
          if (balance > 0) {
            balanceEmoji = "📈";
          } else if (balance < 0) {
            balanceEmoji = "📉";
          }

          dailyOutput.push(
            `${balanceEmoji} *${groupInfo.group_name}*\n  ↳ Membros: ${
              groupInfo.group_size
            }\n  ↳ Entradas: ${addCount}\n  ↳ Saídas: ${removeCount}\n  ↳ Desistências: ${dropoutCount}${
              dropoutTime > 0 ? "\n  ↳ Permanência: " + formattedGroupDropoutTime : ""
            }\n  ↳ Saldo: ${balance > 0 ? "+" : ""}${balance}\n  ↳ Retenção: ${retention}%\n`
          );
        }
      });

    const totalDayBalance = totalDayAdd - totalDayRemove;

    let totalDayEmoji = "⚖️";
    if (totalDayBalance > 0) {
      totalDayEmoji = "🔼";
    } else if (totalDayBalance < 0) {
      totalDayEmoji = "🔽";
    }

    if (hasGroupData) {
      const averageDayDropoutTime = totalDayDropout > 0 ? totalDayDropoutTime / totalDayDropoutTimeCount : 0;
      const formattedDayDropoutTime = formatMillisecondsToTime(averageDayDropoutTime);

      statisticsMessage += `---------------------------------\n`;
      statisticsMessage += `*🗓 ${formattedDate}*\n`;
      statisticsMessage += `*${totalDayEmoji} Totais do dia:*\n  ↳ Membros: ${totalDateParticipants}\n  ↳ Entradas: ${totalDayAdd}\n  ↳ Saídas: ${totalDayRemove}\n  ↳ Desistências: ${totalDayDropout}${
        averageDayDropoutTime > 0 ? "\n  ↳ Permanência: " + formattedDayDropoutTime : ""
      }\n  ↳ Saldo: ${totalDayBalance > 0 ? "+" : ""}${totalDayBalance}\n  ↳ Retenção: ${
        totalDayAdd > 0 ? Math.floor(((totalDayAdd - totalDayDropout) / totalDayAdd) * 100) : 0
      }%\n\n`;
      if (isDetailed) {
        dailyOutput.forEach((line) => {
          statisticsMessage += `${line}\n`;
        });
      }

      totalPeriodAdd += totalDayAdd;
      totalPeriodRemove += totalDayRemove;
      totalPeriodDropout += totalDayDropout;
      totalDropoutTime += averageDayDropoutTime;
      totalDropoutCount = totalDayDropout > 0 ? totalDropoutCount + 1 : totalDropoutCount;
    }
  });

  const totalPeriodBalance = totalPeriodAdd - totalPeriodRemove;
  const averageTotalDropoutTime = totalDropoutCount > 0 ? totalDropoutTime / totalDropoutCount : 0;
  const formattedTotalDropoutTime = formatMillisecondsToTime(averageTotalDropoutTime);

  let totalPeriodMessage = "*Estatísticas dos grupos*\n";
  if (isDetailed) {
    totalPeriodMessage += "*Versão estendida* 📃\n";
  }
  totalPeriodMessage += `---------------------------------\n\n`;

  totalPeriodMessage += `📊 *Resumo de ${days == 0 ? "hoje" : days == 1 ? days + " dia" : days + " dias"}*\n\n`;
  totalPeriodMessage += `🏘 Grupos: ${totalGroups}\n`;
  totalPeriodMessage += `👤 Membros: ${totalParticipants}\n`;
  totalPeriodMessage += `---------------------------------\n`;
  totalPeriodMessage += `🟢 *Entradas:* ${totalPeriodAdd}\n`;
  totalPeriodMessage += `🔴 *Saídas:* ${totalPeriodRemove}\n`;
  totalPeriodMessage += `🟡 *Desistências:* ${totalPeriodDropout}\n`;
  totalPeriodMessage += `⏱ *Permanência:* ${formattedTotalDropoutTime}\n`;
  totalPeriodMessage += `---------------------------------\n`;
  totalPeriodMessage += `${
    totalPeriodBalance > 0 ? "🔼 *Expansão:* +" : totalPeriodBalance < 0 ? "🔽 *Retração:* " : "⚖️ *Saldo:* "
  }${totalPeriodBalance}\n`;
  totalPeriodMessage += `🔒 *Retenção:* ${
    totalPeriodAdd > 0 ? Math.floor(((totalPeriodAdd - totalPeriodDropout) / totalPeriodAdd) * 100) : 0
  }%\n`;

  statisticsMessage =
    hasAnyGroupData && (days > 0 || isDetailed)
      ? totalPeriodMessage + `\n\n📊 *Detalhamento*\n` + statisticsMessage
      : totalPeriodMessage;

  return statisticsMessage.replace(/\n+$/, "");
}

export async function updateGroupStatistics(groupUpdateData, groupName, groupSize) {
  const groupId = groupUpdateData.id.replace("@g.us", "");
  const participantId = groupUpdateData.participants[0]?.replace("@s.whatsapp.net", "");
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  const currentDate = localDate.toISOString().split("T")[0];
  const nowISOString = new Date().toISOString();

  const groupsStatisticsPath = path.join(__dirname, "./statistics.json");
  let groupsStatistics;
  try {
    const data = fs.readFileSync(groupsStatisticsPath, "utf8");
    groupsStatistics = JSON.parse(data);
  } catch (error) {
    return;
  }

  let groupData = groupsStatistics.find((g) => g[groupId]);
  if (!groupData) {
    groupData = {
      [groupId]: {
        group_name: groupName,
        group_size: groupSize,
        statistics: groupUpdateData.action
          ? [
              {
                [currentDate]: {
                  add_count: 0,
                  remove_count: 0,
                  dropout_count: 0,
                  dropout_time: 0,
                },
              },
            ]
          : [],
        today_members: [],
      },
    };
    groupsStatistics.push(groupData);
  }

  const groupInfo = groupData[groupId];

  groupInfo.today_members = groupInfo.today_members.filter((member) => {
    const addDate = new Date(member[Object.keys(member)[0]].add_datetime);
    return new Date() - addDate < 24 * 60 * 60 * 1000;
  });

  if (!groupUpdateData.action) {
    fs.writeFileSync(groupsStatisticsPath, JSON.stringify(groupsStatistics, null, 2), "utf8");
    return;
  }

  let dailyStats = groupInfo.statistics.find((stat) => stat[currentDate]);
  if (!dailyStats) {
    dailyStats = { [currentDate]: { add_count: 0, remove_count: 0, dropout_count: 0, dropout_time: 0 } };
    groupInfo.statistics.push(dailyStats);
  }

  const existingMember = groupInfo.today_members.find((member) => member[participantId]);

  if (existingMember) {
    if (groupUpdateData.action === "remove") {
      groupInfo.group_size--;
      if (!existingMember[participantId].remove_datetime) {
        dailyStats[currentDate].remove_count += 1;
        existingMember[participantId].remove_datetime = nowISOString;

        const addDate = new Date(existingMember[participantId].add_datetime);
        const removeDate = new Date(existingMember[participantId].remove_datetime);
        if (removeDate - addDate < 24 * 60 * 60 * 1000) {
          dailyStats[currentDate].dropout_count += 1;

          const validDropouts = groupInfo.today_members.filter((member) => {
            const memberId = Object.keys(member)[0];
            const addTime = new Date(member[memberId].add_datetime);
            const removeTime = new Date(member[memberId].remove_datetime);
            return removeTime && addTime && removeTime - addTime < 24 * 60 * 60 * 1000;
          });

          const totalDropoutTime = validDropouts.reduce((total, member) => {
            const memberId = Object.keys(member)[0];
            const addTime = new Date(member[memberId].add_datetime);
            const removeTime = new Date(member[memberId].remove_datetime);
            return total + (removeTime - addTime);
          }, 0);

          dailyStats[currentDate].dropout_time = totalDropoutTime / validDropouts.length || 0;
        } else {
          const memberIndex = groupInfo.today_members.indexOf(existingMember);
          if (memberIndex !== -1) {
            groupInfo.today_members.splice(memberIndex, 1);
          }
        }
      }
    } else {
      groupInfo.group_size++;
    }
    fs.writeFileSync(groupsStatisticsPath, JSON.stringify(groupsStatistics, null, 2), "utf8");
  } else {
    if (groupUpdateData.action === "add") {
      groupInfo.today_members.push({
        [participantId]: { add_datetime: nowISOString, remove_datetime: "" },
      });
      groupInfo.group_size++;
      dailyStats[currentDate].add_count += 1;
    } else {
      groupInfo.group_size--;
      dailyStats[currentDate].remove_count += 1;
    }
    fs.writeFileSync(groupsStatisticsPath, JSON.stringify(groupsStatistics, null, 2), "utf8");
  }
}

export async function startupAllGroups(allGroupInfo) {
  const groupsStatisticsPath = path.join(__dirname, "./statistics.json");
  let groupsStatistics;
  try {
    const data = fs.readFileSync(groupsStatisticsPath, "utf8");
    groupsStatistics = JSON.parse(data);
  } catch (error) {
    if (error.code === "ENOENT") {
      try {
        fs.writeFileSync(groupsStatisticsPath, "[]", { flag: "wx" });
        groupsStatistics = [];
      } catch (writeError) {
        console.error("Erro ao criar o arquivo:", writeError);
      }
    } else {
      console.error("Erro ao ler o arquivo:", error);
      return;
    }
  }

  const validGroupIds = new Set(allGroupInfo.map((group) => group.groupId));
  // Remove ghost groups
  groupsStatistics = groupsStatistics.filter((stat) => validGroupIds.has(Object.keys(stat)[0]));

  for (const uptodateGroup of allGroupInfo) {
    const groupId = uptodateGroup.groupId;
    const existingGroupIndex = groupsStatistics.findIndex((stat) => Object.keys(stat)[0] === groupId);
    const existingGroup = existingGroupIndex !== -1 ? groupsStatistics[existingGroupIndex][groupId] : null;
    if (existingGroup) {
      existingGroup.group_name = uptodateGroup.groupName;
      existingGroup.group_size = uptodateGroup.groupSize;
      for (const stat of existingGroup.statistics) {
        for (const date in stat) {
          if (!stat[date].hasOwnProperty("dropout_time")) {
            stat[date].dropout_time = 0;
          }
        }
      }
    } else {
      const newGroupData = {
        [groupId]: {
          group_name: uptodateGroup.groupName,
          group_size: uptodateGroup.groupSize,
          statistics: [],
          today_members: [],
        },
      };
      groupsStatistics.push(newGroupData);
    }
  }

  try {
    fs.writeFileSync(groupsStatisticsPath, JSON.stringify(groupsStatistics, null, 2), "utf8");
  } catch (error) {
    console.error("Erro ao salvar statistics.json:", error);
  }
}
