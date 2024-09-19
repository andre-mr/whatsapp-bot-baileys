import { ConsoleColors } from "./constants.js";

let isMenuOpen = false; // Global variable to track menu state

export function consoleLogColor(text, color = ConsoleColors.RESET, timestamp = true, force = false) {
  if (isMenuOpen && !force) return; // Skip logging if menu is open unless forced
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
    const formattedText = `[${timestamp}] ${text}`;
    console.log(`${color}${formattedText}${ConsoleColors.RESET}`);
  } else {
    console.log(`${color}${text}${ConsoleColors.RESET}`);
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
    throw error;
  }
}

export function deepEqual(obj1, obj2) {
  if (obj1 === obj2) return true; // Same reference or both null
  if (obj1 == null || obj2 == null) {
    return false; // One is null
  }
  if (typeof obj1 !== "object" || typeof obj2 !== "object") {
    return false; // Different types
  }
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  if (keys1.length !== keys2.length) {
    return false; // Different number of keys
  }
  for (let key of keys1) {
    if (!keys2.includes(key) || !deepEqual(obj1[key], obj2[key])) {
      return false; // Key not found or values are not equal
    }
  }

  return true; // All keys and values are equal
}

// Function to set menu state
export function setMenuState(state) {
  isMenuOpen = state;
}
