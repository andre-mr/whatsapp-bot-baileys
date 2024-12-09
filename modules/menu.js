import { ConsoleColors, ImageAspects, SendMethods } from "./constants.js";
import { consoleLogColor } from "./utils.js";
import { Config, showCurrentConfig, saveConfig } from "./config.js";
import { printStatistics } from "./statistics.js";
import { setMenuState } from "./utils.js";

export async function showMainMenu(rl) {
  setMenuState(true);
  let exitMenu = false;
  while (!exitMenu) {
    displayMenuOptions();
    const option = await askQuestion(rl, "\nEscolha uma opção: ");
    consoleLogColor(
      "--------------------------------------------------------------------------------",
      ConsoleColors.RESET,
      false,
      true
    );
    exitMenu = await handleMenuOption(option, rl);
  }
  setMenuState(false);
  return true;
}

function askQuestion(rl, question) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      rl.write("0\n");
      consoleLogColor("Tempo excedido, menu encerrado.", ConsoleColors.YELLOW, false, true);
    }, 30000);

    rl.question(question, (answer) => {
      clearTimeout(timeout);
      resolve(answer);
    });
  });
}

function displayMenuOptions() {
  consoleLogColor("\nMenu de configurações", ConsoleColors.YELLOW, false, true);

  const menuOptions = [
    "1. Método de envio padrão",
    "2. Aspecto de imagem",
    "3. Pausa entre grupos",
    "4. Pausa entre mensagens",
    "5. Números autorizados",
    "6. Palavras-chave para grupos",
    "7. Rastreamento de links",
    "8. Estatísticas de grupos",
    "9. Mostrar configurações",
    "0. Sair do menu",
  ];
  consoleLogColor(menuOptions.join("\n"), ConsoleColors.BRIGHT, false, true);
}

async function handleMenuOption(option, rl) {
  switch (option) {
    case "1":
      await modifySendMethod(rl);
      return false;

    case "2":
      await modifyImageAspect(rl);
      return false;

    case "3":
      await modifyDelayBetweenGroups(rl);
      return false;

    case "4":
      await modifyDelayBetweenMessages(rl);
      return false;

    case "5":
      await modifyArrayOption("AUTHORIZED_NUMBERS", rl);
      return false;

    case "6":
      await modifyArrayOption("GROUP_NAME_KEYWORDS", rl);
      return false;

    case "7":
      await modifyArrayOption("LINK_TRACKING_DOMAINS", rl);
      return false;

    case "8":
      await groupStatistics(rl);
      return false;

    case "9":
      showCurrentConfig();
      return false;

    case "0":
      consoleLogColor(
        "A qualquer momento, digite 'menu' para configurar ou 'sair' para encerrar.\n",
        ConsoleColors.YELLOW,
        false,
        true
      );
      return true;
    default:
      consoleLogColor("Opção inválida!", ConsoleColors.RED, false, true);
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
      false,
      true
    );

    consoleLogColor(
      ["1. Encaminhar", "2. Texto", "3. Imagem", "0. Voltar ao menu principal"].join("\n"),
      ConsoleColors.BRIGHT,
      false,
      true
    );

    rl.question("\nEscolha o novo método de envio: ", (newMethod) => {
      consoleLogColor(
        "--------------------------------------------------------------------------------",
        ConsoleColors.RESET,
        false,
        true
      );
      switch (newMethod) {
        case "1":
          Config.DEFAULT_SEND_METHOD = SendMethods.FORWARD;
          saveConfig();
          consoleLogColor(`Método de envio atualizado para: "Encaminhar"`, ConsoleColors.GREEN, false, true);
          break;
        case "2":
          Config.DEFAULT_SEND_METHOD = SendMethods.TEXT;
          saveConfig();
          consoleLogColor(`Método de envio atualizado para: "Texto"`, ConsoleColors.GREEN, false, true);
          break;
        case "3":
          Config.DEFAULT_SEND_METHOD = SendMethods.IMAGE;
          saveConfig();
          consoleLogColor(`Método de envio atualizado para: "Imagem"`, ConsoleColors.GREEN, false, true);
          break;
        case "0":
          break;
        default:
          consoleLogColor("Opção inválida!", ConsoleColors.RED, false, true);
      }
      resolve();
    });
  });
}

function modifyImageAspect(rl) {
  return new Promise((resolve) => {
    consoleLogColor(
      `\nAspecto de imagem atual: "${Config.IMAGE_ASPECT === ImageAspects.ORIGINAL ? "Original" : "Quadrado"}"\n`,
      ConsoleColors.CYAN,
      false,
      true
    );

    consoleLogColor(
      ["1. Original", "2. Quadrado", "0. Voltar ao menu principal"].join("\n"),
      ConsoleColors.BRIGHT,
      false,
      true
    );

    rl.question("\nEscolha o novo aspecto de imagem: ", (newAspect) => {
      consoleLogColor(
        "--------------------------------------------------------------------------------",
        ConsoleColors.RESET,
        false,
        true
      );
      switch (newAspect) {
        case "1":
          Config.IMAGE_ASPECT = ImageAspects.ORIGINAL;
          saveConfig();
          consoleLogColor(`Aspecto de imagem atualizado para: "Original"`, ConsoleColors.GREEN, false, true);
          break;
        case "2":
          Config.IMAGE_ASPECT = ImageAspects.SQUARE;
          saveConfig();
          consoleLogColor(`Aspecto de imagem atualizado para: "Quadrado"`, ConsoleColors.GREEN, false, true);
          break;
        case "0":
          break;
        default:
          consoleLogColor("Opção inválida!", ConsoleColors.RED, false, true);
      }
      resolve();
    });
  });
}

function groupStatistics(rl) {
  return new Promise((resolve) => {
    consoleLogColor(
      `\nOpção atual: "${Config.GROUP_STATISTICS ? "Ativado" : "Desativado"}"\n`,
      ConsoleColors.CYAN,
      false,
      true
    );

    consoleLogColor(
      ["1. Ativar", "2. Desativar", "3. Mostrar estatísticas", "0. Voltar ao menu principal"].join("\n"),
      ConsoleColors.BRIGHT,
      false,
      true
    );

    rl.question("\nEscolha a nova opção: ", (newOption) => {
      consoleLogColor(
        "--------------------------------------------------------------------------------",
        ConsoleColors.RESET,
        false,
        true
      );
      switch (newOption) {
        case "1":
          Config.GROUP_STATISTICS = true;
          saveConfig();
          consoleLogColor(`Registro de estatísticas de grupos ativado.`, ConsoleColors.GREEN, false, true);
          break;
        case "2":
          Config.GROUP_STATISTICS = false;
          saveConfig();
          consoleLogColor(`Registro de estatísticas de grupos desativado.`, ConsoleColors.GREEN, false, true);
          break;
        case "3":
          printStatistics();
          break;
        case "0":
          break;
        default:
          consoleLogColor("Opção inválida!", ConsoleColors.RED, false, true);
      }
      resolve();
    });
  });
}

function modifyDelayBetweenGroups(rl) {
  return new Promise((resolve) => {
    consoleLogColor(
      `\nPausa entre grupos atual: ${Config.DELAY_BETWEEN_GROUPS} segundos.\n`,
      ConsoleColors.CYAN,
      false,
      true
    );
    rl.question("Novo tempo de pausa entre grupos (1-60 segundos): ", (newDelay) => {
      consoleLogColor(
        "--------------------------------------------------------------------------------",
        ConsoleColors.RESET,
        false,
        true
      );
      const parsedDelay = parseInt(newDelay);
      if (isNaN(parsedDelay) || parsedDelay < 1 || parsedDelay > 60) {
        consoleLogColor("Insira um número entre 1 e 60!", ConsoleColors.RED, false, true);
      } else {
        Config.DELAY_BETWEEN_GROUPS = parsedDelay;
        saveConfig();
        consoleLogColor(
          `Pausa entre grupos atualizada para ${parsedDelay} segundos.`,
          ConsoleColors.GREEN,
          false,
          true
        );
      }
      resolve();
    });
  });
}

function modifyDelayBetweenMessages(rl) {
  return new Promise((resolve) => {
    consoleLogColor(
      `\nPausa entre mensagens atual: ${Config.DELAY_BETWEEN_MESSAGES} segundos.\n`,
      ConsoleColors.CYAN,
      false,
      true
    );
    rl.question("Novo tempo de pausa entre mensagens (1-60 segundos): ", (newDelay) => {
      consoleLogColor(
        "--------------------------------------------------------------------------------",
        ConsoleColors.RESET,
        false,
        true
      );
      const parsedDelay = parseInt(newDelay);
      if (isNaN(parsedDelay) || parsedDelay < 1 || parsedDelay > 60) {
        consoleLogColor("Insira um número entre 1 e 60!", ConsoleColors.RED, false, true);
      } else {
        Config.DELAY_BETWEEN_MESSAGES = parsedDelay;
        saveConfig();
        consoleLogColor(
          `Pausa entre mensagens atualizada para ${parsedDelay} segundos.`,
          ConsoleColors.GREEN,
          false,
          true
        );
      }
      resolve();
    });
  });
}

function modifyArrayOption(option, rl) {
  return new Promise((resolve) => {
    const optionName =
      option === "AUTHORIZED_NUMBERS"
        ? "Números autorizados"
        : option === "GROUP_NAME_KEYWORDS"
        ? "Palavras-chave para grupos"
        : "Domínios para rastreamento de links";
    consoleLogColor(
      `\n${optionName}: ${Config[option].map((item) => `"${item}"`).join(", ")}\n`,
      ConsoleColors.CYAN,
      false,
      true
    );

    const subMenuOptions = ["1. Adicionar item", "2. Remover item", "0. Voltar ao menu principal"];
    consoleLogColor(subMenuOptions.join("\n"), ConsoleColors.BRIGHT, false, true);

    rl.question("\nEscolha uma opção: ", (choice) => {
      consoleLogColor(
        "--------------------------------------------------------------------------------",
        ConsoleColors.RESET,
        false,
        true
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
          consoleLogColor("Opção inválida!", ConsoleColors.RED, false, true);
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
        false,
        true
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
        consoleLogColor(
          `${newValue.trim()} adicionado a ${optionName.toLowerCase()}.`,
          ConsoleColors.GREEN,
          false,
          true
        );
      } else {
        consoleLogColor("Valor inválido! Nenhum item adicionado.", ConsoleColors.RED, false, true);
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
        false,
        true
      );
      if (valueToRemove && valueToRemove.trim() !== "") {
        const initialLength = Config[option].length;
        Config[option] = Config[option].filter((item) => item !== valueToRemove.trim());
        if (Config[option].length < initialLength) {
          saveConfig();
          consoleLogColor(
            `${valueToRemove.trim()} removido de ${optionName.toLowerCase()}.`,
            ConsoleColors.GREEN,
            false,
            true
          );
        } else {
          consoleLogColor(
            `"${valueToRemove.trim()}" não encontrado em ${optionName.toLowerCase()}.`,
            ConsoleColors.YELLOW,
            false,
            true
          );
        }
      } else {
        consoleLogColor("Valor inválido! Nenhum item foi removido.", ConsoleColors.RED, false, true);
      }
      resolve();
    });
  });
}
