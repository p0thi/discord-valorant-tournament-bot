import {
  Client,
  CommandInteraction,
  Guild,
  MessageApplicationCommandData,
  UserApplicationCommandData,
} from "discord.js";
import ValorantApi from "../api/ValorantApi";
import DatabaseManager from "../db/DatabaseManager";
import SlashCommandCreator, {
  SlashCommandTemplate,
} from "../commands/SlashCommandCreator";
import PermissionCommand from "../commands/guild_commands/slash_commands/PermissionCommand";
import ACommandManager from "./ACommandManager";

type ContextMenuItem =
  | UserApplicationCommandData
  | MessageApplicationCommandData;

export default class SlashCommandManager extends ACommandManager {
  bot: Client;
  constructor(bot) {
    super();
    this.bot = bot;
  }

  async getTemplates(): Promise<Map<Guild, SlashCommandTemplate[]>> {
    const res: Map<Guild, SlashCommandTemplate[]> = new Map();
    await Promise.all(
      this.bot.guilds.cache.map(async (guild) => {
        const guildSlashCommands =
          await SlashCommandCreator.getAllGuildSlashCommands(guild);

        guildSlashCommands.forEach(async (commandTemplate) => {
          commandTemplate.addObserver(this);
          if (commandTemplate instanceof PermissionCommand) {
            (commandTemplate as PermissionCommand).addPermissionObserver(this);
          }
        });

        const guildSlashCommandTemplates = await Promise.all(
          guildSlashCommands.map(async (c) => await c.generateTemplate())
        );
        res.set(guild, guildSlashCommandTemplates);
      })
    );
    return res;
  }

  async start() {
    console.log("Starting slash command manager");
    this.bot.on("interactionCreate", this.handle);
    this.bot.application.commands.set(SlashCommandCreator.globalCommands);

    // this.bot.guilds.cache.forEach(async (guild) => {
    //   const guildSlashCommands =
    //     await SlashCommandCreator.getAllGuildSlashCommands(guild);
    //   guildSlashCommands.forEach(async (commandTemplate) => {
    //     commandTemplate.addObserver(this);
    //     if (commandTemplate instanceof PermissionCommand) {
    //       (commandTemplate as PermissionCommand).addPermissionObserver(this);
    //     }
    //   });

    //   const guildSlashCommandTemplates = await Promise.all(
    //     guildSlashCommands.map(async (c) => await c.generateTemplate())
    //   );
    //   console.log(guildSlashCommandTemplates.map((cmd) => cmd.name));

    //   await SlashCommandManager.setGuildCommands(
    //     guildSlashCommandTemplates,
    //     guild
    //   ).then(() => console.log("slash commands set"));
    // });
  }

  async handle(interaction: CommandInteraction) {
    if (!interaction.isCommand()) return;

    for (const cmd of SlashCommandCreator.globalCommands) {
      if (interaction.commandName === cmd.name) {
        cmd.handler(interaction as CommandInteraction);
        return;
      }
    }

    for (const cmd of await SlashCommandCreator.getAllGuildSlashCommands(
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
