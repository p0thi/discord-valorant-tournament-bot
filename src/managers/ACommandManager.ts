import {
  ApplicationCommand,
  ApplicationCommandPermissionData,
  ApplicationCommandPermissions,
  ApplicationCommandPermissionsManager,
  Collection,
  Guild,
  GuildApplicationCommandPermissionData,
  Snowflake,
} from "discord.js";
import ContextMenuCommandCreator, {
  ContextMenuCommandTemplate,
} from "../commands/ContextMenuCommandCreator";
import CustomApplicationCommand, {
  CommandPermissionRole,
} from "../commands/CustomApplicationCommand";
import IGuildSlashCommand, {
  IGuildContextMenuCommand,
} from "../commands/guild_commands/IGuildCommand";
import IGuildCommandObserver from "../commands/guild_commands/IGuildCommandObserver";
import IPermissionChangeObserver from "../commands/guild_commands/IPermissionChangeObserver";
import SlashCommandCreator, {
  SlashCommandTemplate,
} from "../commands/SlashCommandCreator";
import SlashCommandManager from "./SlashCommandManager";

type Template = SlashCommandTemplate | ContextMenuCommandTemplate;

export default abstract class ACommandManager
  implements IGuildCommandObserver, IPermissionChangeObserver
{
  async commandChangeObserved(
    target: IGuildSlashCommand | IGuildContextMenuCommand
  ) {
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

  async onPermissionChange(
    command: IGuildSlashCommand | IGuildContextMenuCommand,
    role: CommandPermissionRole
  ): Promise<Collection<string, ApplicationCommand<{}>>> {
    const allGuildSlashCommands =
      await await SlashCommandCreator.getAllGuildSlashCommands(command.guild);
    const allGuildContextMenuCommands =
      await ContextMenuCommandCreator.getAllGuildContextMenuCommands(
        command.guild
      );

    console.log(role);

    const guildSlashCommandTemplates = (
      await Promise.all(
        allGuildSlashCommands.map(async (c) => await c.generateTemplate())
      )
    ).filter((t) => t.role === role);

    const guildContextMenuCommandTemplates = (
      await Promise.all(
        allGuildContextMenuCommands.map(async (c) => await c.generateTemplate())
      )
    ).filter((t) => t.role === role);

    return ACommandManager.editGuildCommandsPermissions(
      command.guild,
      ...guildSlashCommandTemplates,
      ...guildContextMenuCommandTemplates
    ).catch();
  }

  abstract getTemplates(): Promise<Map<Guild, Template[]>>;

  static async setGuildCommands(...managers: ACommandManager[]) {
    const templates: Map<Guild, Template[]> = new Map();
    for (const manager of managers) {
      const currentTemplates = await manager.getTemplates();

      for (const [guild, guildTemplates] of currentTemplates) {
        if (!templates.has(guild)) {
          templates.set(guild, []);
        }
        templates.get(guild).push(...guildTemplates);
      }
    }

    for (const [guild, guildTemplates] of templates) {
      const customGuildCommands = guildTemplates.map((c) => c.create());

      const setCommands = await guild.commands.set(customGuildCommands);

      guild.commands.permissions.set({
        fullPermissions: (await Promise.all(
          setCommands.map(
            async (c) =>
              ({
                id: c.id as Snowflake,
                permissions:
                  await ACommandManager.getPermissionForTemplateAndGuild(
                    guildTemplates.find((i) => i.name === c.name),
                    guild
                  ),
              } as GuildApplicationCommandPermissionData)
          )
        )) as GuildApplicationCommandPermissionData[],
      });
    }
  }

  static async editGuildCommandsPermissions(
    guild: Guild,
    ...templates: Template[]
  ): Promise<Collection<string, ApplicationCommand<{}>>> {
    const guildCommands = guild.commands.cache.filter(
      (c) => !!templates.find((x) => x.name === c.name)
    );
    const customGuildCommands = templates.map((c) => c.create());

    console.log(
      "editing templates:",
      templates.map((x) => x.name)
    );

    const templateCommands = (await guild.commands.fetch()).filter(
      (g) => !!templates.find((t) => t.name === g.name)
    );

    await guild.commands.permissions
      .set({
        fullPermissions: await Promise.all(
          templateCommands.map(async (c) => {
            return {
              id: c.id as Snowflake,
              permissions:
                await ACommandManager.getPermissionForTemplateAndGuild(
                  templates.find((t) => t.name === c.name),
                  guild
                ),
            };
          })
        ),
      })
      .catch((e) => console.error("Error setting permissions... ", e));
    console.log("editing done");
    return templateCommands;
  }

  static async getPermissionForTemplateAndGuild(
    template: Template,
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
