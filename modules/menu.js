import { ConsoleColors, SendMethods } from "./constants.js";
import { consoleLogColor } from "./utils.js";
import { Config, showCurrentConfig, saveConfig } from "./config.js";

export async function showMainMenu(rl) {
  let exitMenu = false;
  while (!exitMenu) {
    displayMenuOptions();
    const option = await askQuestion(rl, "\nEscolha uma opção: ");
    consoleLogColor(
      "--------------------------------------------------------------------------------",
      ConsoleColors.RESET,
      false
    );
    exitMenu = await handleMenuOption(option, rl);
  }
  return true;
}

function askQuestion(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

function displayMenuOptions() {
  consoleLogColor("\nMenu de configurações", ConsoleColors.YELLOW, false);
  const menuOptions = [
    "1. Método de envio padrão",
    "2. Pausa entre grupos",
    "3. Pausa entre mensagens",
    "4. Números autorizados",
    "5. Palavras-chave para grupos",
    "6. Mostrar configurações",
    "0. Sair do menu",
  ];
  consoleLogColor(menuOptions.join("\n"), ConsoleColors.BRIGHT, false);
}

async function handleMenuOption(option, rl) {
  switch (option) {
    case "1":
      await modifySendMethod(rl);
      return false;

    case "2":
      await modifyDelayBetweenGroups(rl);
      return false;

    case "3":
      await modifyDelayBetweenMessages(rl);
      return false;

    case "4":
      // await modifyArrayOption("AUTHORIZED_NUMBERS", rl);
      await modifyNumberOptions(rl);
      return false;

    case "5":
      await modifyArrayOption("GROUP_NAME_KEYWORDS", rl);
      return false;

    case "6":
      showCurrentConfig();
      return false;

    case "0":
      consoleLogColor(
        "A qualquer momento, digite 'menu' para configurar ou 'sair' para encerrar.\n",
        ConsoleColors.YELLOW,
        false
      );
      return true;
    default:
      consoleLogColor("Opção inválida.", ConsoleColors.RED, false);
      return false;
  }
}

function modifySendMethod(rl) {
  return new Promise((resolve) => {
    consoleLogColor(
      `\nMétodo de envio atual: "${
        Config.DEFAULT_SEND_METHOD === SendMethods.FORWARD
          ? "Encaminhar"
          : Config.DEFAULT_SEND_METHOD === SendMethods.TEXT
          ? "Texto"
          : Config.DEFAULT_SEND_METHOD === SendMethods.IMAGE
          ? "Imagem"
          : "Desconhecido"
      }"\n`,
      ConsoleColors.CYAN,
      false
    );

    consoleLogColor(
      ["1. Encaminhar", "2. Texto", "3. Imagem", "0. Voltar ao menu principal"].join("\n"),
      ConsoleColors.BRIGHT,
      false
    );

    rl.question("\nEscolha o novo método de envio: ", (newMethod) => {
      consoleLogColor(
        "--------------------------------------------------------------------------------",
        ConsoleColors.RESET,
        false
      );
      switch (newMethod) {
        case "1":
          Config.DEFAULT_SEND_METHOD = SendMethods.FORWARD;
          saveConfig();
          consoleLogColor(`Método de envio atualizado para: "Encaminhar"`, ConsoleColors.GREEN, false);
          break;
        case "2":
          Config.DEFAULT_SEND_METHOD = SendMethods.TEXT;
          saveConfig();
          consoleLogColor(`Método de envio atualizado para: "Texto"`, ConsoleColors.GREEN, false);
          break;
        case "3":
          Config.DEFAULT_SEND_METHOD = SendMethods.IMAGE;
          saveConfig();
          consoleLogColor(`Método de envio atualizado para: "Imagem"`, ConsoleColors.GREEN, false);
          break;
        case "0":
          break;
        default:
          consoleLogColor("Opção inválida.", ConsoleColors.RED, false);
      }
      resolve();
    });
  });
}

function modifyDelayBetweenGroups(rl) {
  return new Promise((resolve) => {
    consoleLogColor(`\nPausa entre grupos atual: ${Config.DELAY_BETWEEN_GROUPS} segundos\n`, ConsoleColors.CYAN, false);
    rl.question("Novo tempo de pausa entre grupos (1-60 segundos): ", (newDelay) => {
      consoleLogColor(
        "--------------------------------------------------------------------------------",
        ConsoleColors.RESET,
        false
      );
      const parsedDelay = parseInt(newDelay);
      if (isNaN(parsedDelay) || parsedDelay < 1 || parsedDelay > 60) {
        consoleLogColor("Insira um número entre 1 e 60.", ConsoleColors.RED, false);
      } else {
        Config.DELAY_BETWEEN_GROUPS = parsedDelay;
        saveConfig();
        consoleLogColor(`Pausa entre grupos atualizada para ${parsedDelay} segundos.`, ConsoleColors.GREEN, false);
      }
      resolve();
    });
  });
}

function modifyDelayBetweenMessages(rl) {
  return new Promise((resolve) => {
    consoleLogColor(
      `\nPausa entre mensagens atual: ${Config.DELAY_BETWEEN_MESSAGES} segundos\n`,
      ConsoleColors.CYAN,
      false
    );
    rl.question("Novo tempo de pausa entre mensagens (1-60 segundos): ", (newDelay) => {
      consoleLogColor(
        "--------------------------------------------------------------------------------",
        ConsoleColors.RESET,
        false
      );
      const parsedDelay = parseInt(newDelay);
      if (isNaN(parsedDelay) || parsedDelay < 1 || parsedDelay > 60) {
        consoleLogColor("Insira um número entre 1 e 60.", ConsoleColors.RED, false);
      } else {
        Config.DELAY_BETWEEN_MESSAGES = parsedDelay;
        saveConfig();
        consoleLogColor(`Pausa entre mensagens atualizada para ${parsedDelay} segundos.`, ConsoleColors.GREEN, false);
      }
      resolve();
    });
  });
}

async function modifyNumberOptions(rl) {
  const subMenuOptions = [
    "1. Número do Bot",
    "2. Números autorizados a enviar mensagens",
    "0. Voltar ao menu principal",
  ];

  consoleLogColor(subMenuOptions.join("\n"), ConsoleColors.BRIGHT, false);

  const choice = await askQuestion(rl, "\nEscolha uma opção:");
  consoleLogColor(
    "--------------------------------------------------------------------------------",
    ConsoleColors.RESET,
    false
  );

  switch (choice) {
    case "1":
      await modifyBotNumber(rl); // Modify Bot Number
      break;
    case "2":
      await modifyArrayOption("AUTHORIZED_NUMBERS", rl); // Modify Authorized Numbers
      break;
    case "0":
      return; // Go back to main menu
    default:
      consoleLogColor("Opção inválida.", ConsoleColors.RED, false);
  }
}

function modifyBotNumber(rl) {
  consoleLogColor(`Número do bot atual: ${Config.OWN_NUMBER}\n`, ConsoleColors.CYAN, false);
  return new Promise((resolve) => {
    rl.question("Digite o número do Bot (Ex: 553499995555): ", (newNumber) => {
      consoleLogColor(
        "--------------------------------------------------------------------------------",
        ConsoleColors.RESET,
        false
      );
      if (
        newNumber &&
        newNumber.trim() !== "" &&
        /^\d+$/.test(newNumber) &&
        newNumber.length >= 11 &&
        newNumber.length <= 12
      ) {
        Config.OWN_NUMBER = newNumber.trim(); // Save the bot number
        saveConfig();
        consoleLogColor(`Número do Bot atualizado para: ${Config.OWN_NUMBER}`, ConsoleColors.GREEN, false);
      } else {
        consoleLogColor("Valor inválido. Nenhum número foi salvo.", ConsoleColors.RED, false);
      }
      resolve();
    });
  });
}

function modifyArrayOption(option, rl) {
  return new Promise((resolve) => {
    const optionName = option === "AUTHORIZED_NUMBERS" ? "Números autorizados" : "Palavras-chave para grupos";
    consoleLogColor(
      `\n${optionName}: ${Config[option].map((item) => `"${item}"`).join(", ")}\n`,
      ConsoleColors.CYAN,
      false
    );

    const subMenuOptions = ["1. Adicionar item", "2. Remover item", "0. Voltar ao menu principal"];
    consoleLogColor(subMenuOptions.join("\n"), ConsoleColors.BRIGHT, false);

    rl.question("\nEscolha uma opção: ", (choice) => {
      consoleLogColor(
        "--------------------------------------------------------------------------------",
        ConsoleColors.RESET,
        false
      );
      switch (choice) {
        case "1":
          addItem(option, optionName, rl).then(() => modifyArrayOption(option, rl).then(resolve));
          break;
        case "2":
          removeItem(option, optionName, rl).then(() => modifyArrayOption(option, rl).then(resolve));
          break;
        case "0":
          resolve();
          break;
        default:
          consoleLogColor("Opção inválida.", ConsoleColors.RED, false);
          modifyArrayOption(option, rl).then(resolve);
          break;
      }
    });
  });
}

function addItem(option, optionName, rl) {
  return new Promise((resolve) => {
    rl.question(`Digite o valor para adicionar a ${optionName.toLowerCase()}: `, (newValue) => {
      consoleLogColor(
        "--------------------------------------------------------------------------------",
        ConsoleColors.RESET,
        false
      );
      if (
        option === "AUTHORIZED_NUMBERS"
          ? newValue &&
            newValue.trim() !== "" &&
            /^\d+$/.test(newValue.trim()) &&
            newValue.trim().length >= 11 &&
            newValue.trim().length <= 12
          : newValue && newValue.trim() !== ""
      ) {
        Config[option].push(newValue.trim());
        saveConfig();
        consoleLogColor(`${newValue.trim()} adicionado a ${optionName.toLowerCase()}.`, ConsoleColors.GREEN, false);
      } else {
        consoleLogColor("Valor inválido. Nenhum item adicionado.", ConsoleColors.RED, false);
      }
      resolve();
    });
  });
}

function removeItem(option, optionName, rl) {
  return new Promise((resolve) => {
    rl.question(`Digite o valor para remover de ${optionName.toLowerCase()}: `, (valueToRemove) => {
      consoleLogColor(
        "--------------------------------------------------------------------------------",
        ConsoleColors.RESET,
        false
      );
      if (valueToRemove && valueToRemove.trim() !== "") {
        const initialLength = Config[option].length;
        Config[option] = Config[option].filter((item) => item !== valueToRemove.trim());
        if (Config[option].length < initialLength) {
          saveConfig();
          consoleLogColor(
            `${valueToRemove.trim()} removido de ${optionName.toLowerCase()}.`,
            ConsoleColors.GREEN,
            false
          );
        } else {
          consoleLogColor(
            `"${valueToRemove.trim()}" não encontrado em ${optionName.toLowerCase()}.`,
            ConsoleColors.YELLOW,
            false
          );
        }
      } else {
        consoleLogColor("Valor inválido. Nenhum item foi removido.", ConsoleColors.RED, false);
      }
      resolve();
    });
  });
}
