import { CommandInteraction, Guild } from "discord.js";
import { Types } from "mongoose";
import DatabaseManager from "../../db/DatabaseManager";
import IGuild, { IGuildPermission } from "../../db/interfaces/IGuild";
import CustomApplicationCommand, {
  CommandPermissionRole,
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
    const role = CommandPermissionRole.ADMIN;
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
              name: "list",
              description: "Lists all the permission currently applied.",
              type: "SUB_COMMAND",
            },
            {
              name: "edit",
              description: "Edits a permission.",
              type: "SUB_COMMAND",
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
                  choices: Object.keys(CommandPermissionRole)
                    .filter((k) => isNaN(Number(k)))
                    .map((k) => ({
                      name: k[0] + k.slice(1).toLowerCase(),
                      value: k,
                    })),
                },
              ],
            },
          ],

          handler: async (interaction: CommandInteraction) => {
            const subCommand = interaction.options.getSubcommand();

            interaction.defer({ ephemeral: true });
            const dbGuild = await dbManager.getGuild({
              discordId: this.guild.id,
            });

            switch (subCommand) {
              case "list":
                {
                  const rolesByPermission: Map<
                    CommandPermissionRole,
                    Set<string>
                  > = new Map();

                  dbGuild.permissions.forEach((permission) => {
                    const role = CommandPermissionRole[permission.permission];
                    if (!rolesByPermission.has(role)) {
                      rolesByPermission.set(role, new Set());
                    }
                    rolesByPermission.get(role).add(permission.roleId);
                  });
                  console.log(rolesByPermission);
                  interaction.followUp({
                    ephemeral: true,
                    embeds: [
                      {
                        title: "Current permissions:",
                        fields: Array.from(rolesByPermission).map(([k, v]) => ({
                          name: k,
                          value: Array.from(v, (x) => `<@&${x}>`).join(", "),
                        })),
                      },
                    ],
                  });
                }
                break;
              case "edit":
                {
                  const { value: mode } = interaction.options.get("mode");
                  const { value: role } = interaction.options.get("role");
                  const { value: category } =
                    interaction.options.get("category");

                  switch (mode) {
                    case "grant":
                      {
                        if (
                          !dbGuild.permissions.find(
                            (p) =>
                              p.roleId === role && p.permission === category
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
                          CommandPermissionRole[category as string]
                        );
                      }
                      break;
                    case "revoke":
                      {
                        if (
                          dbGuild.permissions.find(
                            (p) =>
                              p.roleId === role && p.permission === category
                          )
                        ) {
                          const newPermissions = dbGuild.permissions.filter(
                            (p) =>
                              p.roleId !== role && p.permission !== category
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
                          CommandPermissionRole[category as string]
                        );
                      }

                      break;
                  }
                }
                break;
            }
          },
        } as CustomApplicationCommand;
      },
    } as SlashCommandTemplate;
  }

  notifyPermissionObservers(role: CommandPermissionRole) {
    if (!role) {
      return;
    }

    this._permissionObservers.forEach((o) => o.onPermissionChange(this, role));
  }

  notifyObservers() {
    this.observers.forEach((observer) => observer.commandChangeObserved(this));
  }
}
