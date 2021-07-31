import {
  ApplicationCommand,
  ApplicationCommandPermissionData,
  Client,
  Guild,
  Snowflake,
} from "discord.js";
import DatabaseManager from "../db/DatabaseManager";

export enum CommandPermissionRole {
  ADMIN = "ADMIN",
  MOD = "MOD",
}

export default class CustomApplicationCommand extends ApplicationCommand {
  handler: (Interaction) => Promise<void>;
  forOwner: boolean = true;
  role: CommandPermissionRole;

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
    guildId: string,
    role: CommandPermissionRole
  ): Promise<ApplicationCommandPermissionData[]> {
    const dbGuild = await DatabaseManager.getInstance().getGuild({
      discordId: guildId,
    });
    const result: ApplicationCommandPermissionData[] = dbGuild.permissions
      .filter((p) => role === CommandPermissionRole[p.permission])
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
