import { ApplicationCommand, Collection } from "discord.js";
import { CommandPermissionRole } from "../CustomApplicationCommand";
import IGuildSlashCommand, { IGuildContextMenuCommand } from "./IGuildCommand";

export default interface IPermissionChangeObserver {
  onPermissionChange(
    command: IGuildSlashCommand | IGuildContextMenuCommand,
    role: CommandPermissionRole
  ): Promise<Collection<string, ApplicationCommand<{}>>>;
}
