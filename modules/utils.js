import { ConsoleColors } from "./constants.js";

let isMenuOpen = false;

export function consoleLogColor(text, color = ConsoleColors.RESET, timestamp = true, force = false) {
  if (isMenuOpen && !force) return;

  let formattedText = text;
  if (timestamp && text) {
    const now = new Date();
    const timestamp = now.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    formattedText = `[${timestamp}] ${text}`;
  }
  switch (color) {
    case ConsoleColors.RED:
      console.error(`${color}${formattedText}${ConsoleColors.RESET}`);
      break;
    case ConsoleColors.YELLOW:
      console.warn(`${color}${formattedText}${ConsoleColors.RESET}`);
      break;
    case ConsoleColors.CYAN:
    case ConsoleColors.GREEN:
      console.info(`${color}${formattedText}${ConsoleColors.RESET}`);
      break;
    default:
      console.log(`${color}${formattedText}${ConsoleColors.RESET}`);
      break;
  }
}

export async function fetchWhatsAppVersion() {
  const waVersionsUrl = "https://wppconnect.io/whatsapp-versions/";
  try {
    const response = await fetch(waVersionsUrl);
    const html = await response.text();

    const versionRegex = /href="https:\/\/web\.whatsapp\.com\/\?v=(\d+)\.(\d+)\.(\d+)-alpha"/;
    const match = html.match(versionRegex);

    if (match) {
      return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
    } else {
      throw new Error("WhatsApp version not found in the HTML");
    }
  } catch (error) {
    consoleLogColor("Erro ao verificar versão atual do WhatsApp!", ConsoleColors.RED);
  }
}

export function deepEqual(obj1, obj2) {
  if (obj1 === obj2) return true;
  if (obj1 == null || obj2 == null) {
    return false;
  }
  if (typeof obj1 !== "object" || typeof obj2 !== "object") {
    return false;
  }
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  if (keys1?.length !== keys2?.length) {
    return false;
  }
  for (let key of keys1) {
    if (!keys2.includes(key) || !deepEqual(obj1[key], obj2[key])) {
      return false;
    }
  }

  return true;
}

export function setMenuState(state) {
  isMenuOpen = state;
}

export function formatMillisecondsToTime(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0 && minutes === 0 && seconds === 0) {
    return `${hours}h`;
  } else if (hours > 0 && seconds === 0) {
    return `${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  } else if (minutes > 0 && seconds === 0) {
    return `${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  } else {
    return `${seconds}s`;
  }
}
