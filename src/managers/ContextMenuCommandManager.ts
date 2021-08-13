import {
  Client,
  CommandInteraction,
  ContextMenuInteraction,
  Guild,
  MessageApplicationCommandData,
  UserApplicationCommandData,
} from "discord.js";
import ValorantApi from "../api/ValorantApi";
import DatabaseManager from "../db/DatabaseManager";
import SlashCommandCreator, {
  SlashCommandTemplate,
} from "../commands/SlashCommandCreator";
import ContextMenuCommandCreator, {
  ContextMenuCommandTemplate,
} from "../commands/ContextMenuCommandCreator";
import ACommandManager from "./ACommandManager";

export default class ContextMenuCommandManager extends ACommandManager {
  bot: Client;

  private _waitingForTemplates: Array<
    (templates: ContextMenuCommandTemplate[]) => void
  > = [];
  constructor(bot) {
    super();
    this.bot = bot;
  }

  async getTemplates(): Promise<Map<Guild, ContextMenuCommandTemplate[]>> {
    const res: Map<Guild, ContextMenuCommandTemplate[]> = new Map();
    await Promise.all(
      this.bot.guilds.cache.map(async (guild) => {
        const guildContextMenuCommands =
          await ContextMenuCommandCreator.getAllGuildContextMenuCommands(guild);

        guildContextMenuCommands.forEach(async (commandTemplate) => {
          commandTemplate.addObserver(this);
        });

        const guildContextMenuCommandTemplates = await Promise.all(
          guildContextMenuCommands.map(async (c) => await c.generateTemplate())
        );
        res.set(guild, guildContextMenuCommandTemplates);
      })
    );
    return res;
  }

  async start() {
    console.log("Starting ContextMenuCommandManager");
    this.bot.on("interactionCreate", this.handle);
    this.bot.application.commands.set(SlashCommandCreator.globalCommands);
  }

  async handle(interaction: ContextMenuInteraction) {
    if (!interaction.isContextMenu()) return;

    for (const cmd of ContextMenuCommandCreator.globalCommands) {
      if (interaction.commandName === cmd.name) {
        cmd.handler(interaction as CommandInteraction);
        return;
      }
    }

    for (const cmd of await ContextMenuCommandCreator.getAllGuildContextMenuCommands(
      interaction.guild
    )) {
      const template = await cmd.generateTemplate();
      if (interaction.commandName === template.name) {
        template.create().handler(interaction as CommandInteraction);
        return;
      }
    }
  }
}
