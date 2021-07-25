import {
  ApplicationCommand,
  ApplicationCommandPermissionData,
  Client,
  CommandInteraction,
  Guild,
} from "discord.js";
import ValorantApi from "../api/ValorantApi";
import DatabaseManager from "../db/DatabaseManager";
import SlashCommandCreator, {
  SlashCommandTemplate,
} from "../commands/SlashCommandCreator";
import IGuildCommandObserver from "../commands/guild_commands/IGuildCommandObserver";
import IGuildCommand from "../commands/guild_commands/IGuildCommand";
import CustomApplicationCommand, {
  CommandPermissionRoles,
} from "../commands/CustomApplicationCommand";
import IPermissionChangeObserver from "../commands/guild_commands/IPermissionChangeObserver";
import PermissionCommand from "../commands/guild_commands/PermissionCommand";

const api = ValorantApi.getInstatnce();
const dbManager = DatabaseManager.getInstance();

export default class SlashCommandManager
  implements IGuildCommandObserver, IPermissionChangeObserver
{
  bot: Client;
  constructor(bot) {
    this.bot = bot;
  }
  async onPermissionChange(
    command: IGuildCommand,
    role: CommandPermissionRoles
  ): Promise<void> {
    const allGuildCommands = await SlashCommandCreator.getAllGuildCommands(
      command.guild
    );

    const guildCommandTemplates = await Promise.all(
      allGuildCommands.map(async (c) => await c.generateTemplate())
    );

    console.log(
      "role commands",
      guildCommandTemplates.filter((c) => c.role === role)
    );

    guildCommandTemplates
      .filter((c) => c.role === role)
      .forEach((c) => {
        SlashCommandManager.editGuildCommand(c, command.guild).then((a) => {
          if (!a) {
            console.log("Failed to edit command");
          }
        });
      });
  }

  async commandChangeObserved(target: IGuildCommand) {
    const template = await target.generateTemplate();
    const guildCommand = target.guild.commands.cache.find(
      (i) => i.name === template.name
    );
    const customCommand = template.create();
    customCommand.permissions?.add({
      permissions: await CustomApplicationCommand.getPermissions(
        customCommand.guild.id,
        customCommand.role
      ),
    });
    target.guild.commands.edit(guildCommand, customCommand);
  }

  async start() {
    this.bot.on("interactionCreate", this.handle);
    const setGlobalCommands = await this.bot.application.commands.set(
      SlashCommandCreator.globalCommands
    );

    this.bot.guilds.cache.forEach(async (guild) => {
      const guildCommands = await SlashCommandCreator.getAllGuildCommands(
        guild
      );
      guildCommands.forEach(async (commandTemplate) => {
        commandTemplate.addObserver(this);
        if (commandTemplate instanceof PermissionCommand) {
          (commandTemplate as PermissionCommand).addPermissionObserver(this);
        }
      });

      const guildCommandTemplates = await Promise.all(
        guildCommands.map(async (c) => await c.generateTemplate())
      );

      await SlashCommandManager.setGuildCommands(guildCommandTemplates, guild);
    });
  }

  async handle(interaction: CommandInteraction) {
    if (!interaction.isCommand()) return;

    for (const cmd of SlashCommandCreator.globalCommands) {
      if (interaction.commandName === cmd.name) {
        cmd.handler(interaction as CommandInteraction);
        return;
      }
    }

    for (const cmd of await SlashCommandCreator.getAllGuildCommands(
      interaction.guild
    )) {
      const template = await cmd.generateTemplate();
      if (interaction.commandName === template.name) {
        template.create().handler(interaction as CommandInteraction);
        return;
      }
    }
  }

  static async setGuildCommands(
    templates: SlashCommandTemplate[],
    guild: Guild
  ) {
    const customGuildCommands = templates.map((c) => c.create());

    const setCommands = await guild.commands.set(customGuildCommands);

    setCommands.forEach(async (cmd) => {
      cmd.permissions.set({
        permissions:
          await SlashCommandManager._getPermissionForTemplateAndGuild(
            templates.find((i) => i.name === cmd.name),
            guild
          ),
      });
    });
  }

  static async editGuildCommand(
    template: SlashCommandTemplate,
    guild: Guild
  ): Promise<ApplicationCommand<{}>> {
    const guildCommand = guild.commands.cache.find(
      (c) => c.name === template.name
    );

    if (!guildCommand) {
      return;
    }
    const customGuildCommand = template.create();

    const resultCommand = await guild.commands.edit(
      guildCommand,
      customGuildCommand
    );

    const newPermissions =
      await SlashCommandManager._getPermissionForTemplateAndGuild(
        template,
        guild
      );
    resultCommand.permissions.set({
      permissions: newPermissions,
    });
    return resultCommand;
  }

  private static async _getPermissionForTemplateAndGuild(
    template: SlashCommandTemplate,
    guild: Guild
  ): Promise<ApplicationCommandPermissionData[]> {
    return [
      ...(template.forOwner
        ? [
            {
              id: guild.ownerId,
              type: "USER",
              permission: true,
            } as ApplicationCommandPermissionData,
          ]
        : []),
      ...(await CustomApplicationCommand.getPermissions(
        guild.id,
        template.role
      )),
    ] as ApplicationCommandPermissionData[];
  }
}
