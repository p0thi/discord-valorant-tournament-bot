import { ApplicationCommandPermissionData, Guild } from "discord.js";
import CustomApplicationCommand, {
  CommandPermissionRole,
} from "./CustomApplicationCommand";
import AddMemberToTournament from "./guild_commands/context_menu_commands/AddMemberToTournament";
import RefreshValoInfo from "./guild_commands/context_menu_commands/RefreshValoInfo";
import RemoveMemberFromTournament from "./guild_commands/context_menu_commands/RemoveMemberFromTournament";
import ShowMemberInfo from "./guild_commands/context_menu_commands/ShowMemberInfo";
import { IGuildContextMenuCommand } from "./guild_commands/IGuildCommand";

export default abstract class ContextMenuCommandCreator {
  static globalCommands: CustomApplicationCommand[] = [];
  static async getAllGuildContextMenuCommands(
    guild: Guild
  ): Promise<IGuildContextMenuCommand[]> {
    const commands = [
      ShowMemberInfo.getInstance(guild),
      AddMemberToTournament.getInstance(guild),
      RemoveMemberFromTournament.getInstance(guild),
      RefreshValoInfo.getInstance(guild),
    ];
    return commands;
  }
}

export interface ContextMenuCommandTemplate {
  name: string;
  role?: CommandPermissionRole;
  defaultPermission: boolean;
  forOwner: boolean;
  permissions: ApplicationCommandPermissionData[];
  create: () => CustomApplicationCommand;
}
