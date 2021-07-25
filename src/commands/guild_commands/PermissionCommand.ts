import { CommandInteraction, Guild } from "discord.js";
import { Types } from "mongoose";
import DatabaseManager from "../../db/DatabaseManager";
import IGuild, { IGuildPermission } from "../../db/interfaces/IGuild";
import CustomApplicationCommand, {
  CommandPermissionRoles,
} from "../CustomApplicationCommand";
import SlashCommandCreator, {
  SlashCommandTemplate,
} from "../SlashCommandCreator";
import AObservableCommand from "./AObservableCommand";
import IGuildCommand from "./IGuildCommand";
import IObservablePermission from "./IObservablePermission";
import IPermissionChangeObserver from "./IPermissionChangeObserver";

const dbManager = DatabaseManager.getInstance();

export default class PermissionCommand
  extends AObservableCommand
  implements IGuildCommand, IObservablePermission
{
  private static _tournamentCommands: Map<Guild, PermissionCommand> = new Map();

  private _permissionObservers: IPermissionChangeObserver[] = [];

  guild: Guild;

  private constructor(guild: Guild) {
    super();
    this.guild = guild;
  }

  removePermissionObserver(observer: IPermissionChangeObserver): void {
    const index = this._permissionObservers.indexOf(observer);
    if (index > -1) {
      this._permissionObservers.splice(index, 1);
    }
  }

  addPermissionObserver(observer: IPermissionChangeObserver): void {
    if (this._permissionObservers.includes(observer)) {
      return;
    }
    this._permissionObservers.push(observer);
  }

  public static getInstance(guild: Guild): PermissionCommand {
    if (PermissionCommand._tournamentCommands.has(guild)) {
      return PermissionCommand._tournamentCommands.get(guild);
    }
    const instance = new PermissionCommand(guild);
    PermissionCommand._tournamentCommands.set(guild, instance);
    return instance;
  }

  async generateTemplate(): Promise<SlashCommandTemplate> {
    const role = CommandPermissionRoles.ADMIN;
    return {
      name: "permission",
      role,
      defaultPermission: false,
      forOwner: true,
      create: (): CustomApplicationCommand => {
        return {
          name: "permission",
          description:
            "Lets you set the permissions for a command category to a discrod role",
          defaultPermission: false,
          options: [
            {
              name: "mode",
              description: "If you want to grant or revoke the permission",
              required: true,
              type: "STRING",
              choices: [
                { name: "Grant permission", value: "grant" },
                { name: "Revoke permission", value: "revoke" },
              ],
            },
            {
              name: "role",
              description: "The role to grant to or revoke from",
              type: "ROLE",
              required: true,
            },
            {
              name: "category",
              description:
                "The category of commands to which the permission should be edited",
              required: true,
              type: "STRING",
              choices: Object.keys(CommandPermissionRoles)
                .filter((k) => isNaN(Number(k)))
                .map((k) => ({
                  name: k[0] + k.slice(1).toLowerCase(),
                  value: k,
                })),
            },
          ],

          handler: async (interaction: CommandInteraction) => {
            const { value: mode } = interaction.options.get("mode");
            const { value: role } = interaction.options.get("role");
            const { value: category } = interaction.options.get("category");

            interaction.defer({ ephemeral: true });

            const commands = this.guild.commands.cache;

            const guildCommands = await SlashCommandCreator.getAllGuildCommands(
              this.guild
            );

            const allGuildCommandTemplates = await Promise.all(
              guildCommands.map(async (c) => await c.generateTemplate())
            );

            const dbGuild = await dbManager.getGuild({
              discordId: this.guild.id,
            });

            // const commandsWithRole = [
            //   ...this.guild.commands.cache.filter(
            //     (c) =>
            //       CommandPermissionRoles[
            //         allGuildCommandTemplates.find((i) => i.name === c.name)
            //           ?.role
            //       ] === category
            //   ),
            // ];

            switch (mode) {
              case "grant":
                {
                  if (
                    !dbGuild.permissions.find(
                      (p) => p.roleId === role && p.permission === category
                    )
                  ) {
                    dbGuild.permissions.push({
                      permission: category,
                      roleId: role,
                    } as IGuildPermission);
                    await dbGuild.save();

                    interaction.followUp({
                      content: `Added permission for **${category}** to role <@&${role}>`,
                      ephemeral: true,
                    });
                  } else {
                    interaction.followUp({
                      content: `Permission for **${category}** for <@&${role}> already exists`,
                      ephemeral: true,
                    });
                  }
                  this.notifyPermissionObservers(
                    CommandPermissionRoles[category as string]
                  );
                }
                break;
              case "revoke":
                {
                  if (
                    dbGuild.permissions.find(
                      (p) => p.roleId === role && p.permission === category
                    )
                  ) {
                    const newPermissions = dbGuild.permissions.filter(
                      (p) => p.roleId !== role && p.permission !== category
                    ) as Types.Array<IGuildPermission>;

                    dbGuild.permissions = newPermissions;
                    await dbGuild.save();

                    interaction.followUp({
                      content: `Removed permissions for **${category}** for role <@&${role}>`,
                      ephemeral: true,
                    });
                  } else {
                    interaction.followUp({
                      content: `No permissions for **${category}** for role <@&${role}>`,
                      ephemeral: true,
                    });
                  }

                  this.notifyPermissionObservers(
                    CommandPermissionRoles[category as string]
                  );
                }

                break;
            }
          },
        } as CustomApplicationCommand;
      },
    } as SlashCommandTemplate;
  }

  notifyPermissionObservers(role: CommandPermissionRoles) {
    if (!role) {
      return;
    }

    this._permissionObservers.forEach((o) => o.onPermissionChange(this, role));
  }

  notifyObservers() {
    this.observers.forEach((observer) => observer.commandChangeObserved(this));
  }
}
