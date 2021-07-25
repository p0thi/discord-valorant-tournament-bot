import {
  ApplicationCommand,
  ApplicationCommandPermissionData,
  Client,
  Guild,
  Snowflake,
} from "discord.js";
import DatabaseManager from "../db/DatabaseManager";

export enum CommandPermissionRoles {
  ADMIN = "ADMIN",
  MOD = "MOD",
}

export default class CustomApplicationCommand extends ApplicationCommand {
  handler: (Interaction) => Promise<void>;
  forOwner: boolean = true;
  role: CommandPermissionRoles;

  constructor(
    client: Client,
    data: unknown,
    handler: (Interaction: any) => Promise<void>,
    guild?: Guild,
    guildData?: Snowflake,
    forOwner: boolean = true
  ) {
    super(client, data, guild, guildData);
    this.handler = handler;
    this.forOwner = forOwner;
  }

  static async getPermissions(
    guildId: `${bigint}`,
    role: CommandPermissionRoles
  ): Promise<ApplicationCommandPermissionData[]> {
    const dbGuild = await DatabaseManager.getInstance().getGuild({
      discordId: guildId,
    });
    const result: ApplicationCommandPermissionData[] = dbGuild.permissions
      .filter((p) => role === CommandPermissionRoles[p.permission])
      .map(
        (p) =>
          ({
            id: p.roleId,
            type: "ROLE",
            permission: true,
          } as ApplicationCommandPermissionData)
      );

    return result;
  }
}
