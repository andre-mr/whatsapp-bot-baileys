import { ConsoleColors } from "./constants.js";

export function consoleLogColor(text, color = ConsoleColors.RESET, timestamp = true) {
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
    consoleLogColor("Error fetching WhatsApp version!", ConsoleColors.RED);
    throw error;
  }
}
