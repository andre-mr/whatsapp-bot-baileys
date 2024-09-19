# 📱 WhatsApp Bot Baileys 🚀

## 📝 Descrição

Este projeto é uma aplicação Node.js que permite o envio automatizado de mensagens para grupos do WhatsApp. Ele oferece uma interface de linha de comando para configuração e operação, tornando-o uma ferramenta poderosa para comunicação em massa e distribuição de conteúdo.

## 🌟 Funcionalidades

- 📤 Envio automatizado de mensagens para grupos do WhatsApp
- 🔐 Autenticação de números e grupos autorizados
- 🔄 Múltiplos métodos de envio (encaminhar, texto, imagem)
- ⏱️ Configuração de pausas entre mensagens e grupos
- 🔍 Filtragem de grupos por palavras-chave
- 🛠️ Interface de configuração interativa no terminal

## 🚀 Como Começar

### Pré-requisitos

- Node.js (versão 20 ou superior)
- NPM (gerenciador de pacotes do Node.js)
- Git (sistema de controle de versão)

### Instalação

1. Clone o repositório:

   ```
   git clone https://github.com/andre-mr/whatsapp-bot-baileys.git
   ```

2. Entre no diretório do projeto:

   ```
   cd whatsapp-bot-baileys
   ```

3. Instale as dependências:

   ```
   npm install
   ```

4. Inicie a aplicação:
   ```
   npm start
   ```

## 🖥️ Uso

Após iniciar a aplicação, você poderá a qualquer momento digitar "menu" para exibir o menu interativo de configurações, ou "sair" para encerrar a aplicação.

Para enviar mensagens, basta enviar uma mensagem de número autorizado para o número do bot e a aplicação irá encaminha-la para os grupos autorizados.

Com base nas palavras-chave os grupos autorizados serão carregados automaticamente no início da aplicação e atualizados após cada modificação nos mesmos.

O bot enviará uma mensagem de relatório após o envio de cada lote de mensagens.

Ao enviar a mensagem "status" ou "?" para o bot, ele responderá se está enviando, quantas mensagens faltam enviar, ou se está aguardando novas mensagens. Adicionalmente enviará a data e hora que a aplicação foi iniciada e quantas mensagens já foram enviadas desde então.

## ⚠️ Aviso Legal

Este software deve ser usado de forma ética e em conformidade com os termos de serviço do WhatsApp. O uso indevido para spam ou assédio é estritamente proibido e pode resultar em banimento do número utilizado.

## 📞 Contato

Se você tiver alguma dúvida ou sugestão, por favor, abra uma issue neste repositório ou entre em contato diretamente através do [meu perfil do GitHub](https://github.com/andre-mr).

---

⭐️ Se este projeto foi útil para você, considere dar uma estrela no GitHub!
