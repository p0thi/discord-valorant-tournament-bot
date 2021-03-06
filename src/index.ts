import { config as dotenvConf } from "dotenv";
import { Client, Intents } from "discord.js";
import log from "./util/log";
import DatabaseManager from "./db/DatabaseManager";
import MessageHandler from "./handlers/MessageHandler";
import SlashCommandManager from "./managers/SlashCommandManager";
import GuildManager from "./managers/GuildManager";
import InteractionHandler from "./handlers/InteractionHandler";
import ContextMenuCommandManager from "./managers/ContextMenuCommandManager";
import ACommandManager from "./managers/ACommandManager";

dotenvConf();

const bot = new Client({
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.GUILD_INTEGRATIONS,
    Intents.FLAGS.DIRECT_MESSAGES,
  ],
  partials: ["CHANNEL", "GUILD_MEMBER"],
});

const messageHandler = new MessageHandler(bot);
messageHandler.start();
const interactionHandler = new InteractionHandler(bot);
interactionHandler.start();

const slashCommandManager = new SlashCommandManager(bot);
const contextMenuCommandManager = new ContextMenuCommandManager(bot);
const guildManager = new GuildManager(bot);

const token = process.env.TOKEN;

const databaseManager = DatabaseManager.getInstance();

databaseManager.connect();

bot.on("ready", () => {
  log.info(`Logged in as ${bot.user.tag}`);

  const statusSetter = () => {
    bot.user.setActivity("/help", {
      type: "LISTENING",
    });
  };

  statusSetter();
  setInterval(statusSetter, 1800000);

  slashCommandManager.start();
  contextMenuCommandManager.start();

  ACommandManager.setGuildCommands(
    slashCommandManager,
    contextMenuCommandManager
  );
  guildManager.start();
});

bot.login(token);
