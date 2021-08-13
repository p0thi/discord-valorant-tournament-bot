import { Guild } from "discord.js";
import { ContextMenuCommandTemplate } from "../ContextMenuCommandCreator";
import { SlashCommandTemplate } from "../SlashCommandCreator";
import AObservableCommand from "./AObservableCommand";

export default interface IGuildSlashCommand extends AObservableCommand {
  guild: Guild;
  generateTemplate: () => Promise<SlashCommandTemplate>;
}

export interface IGuildContextMenuCommand extends AObservableCommand {
  guild: Guild;
  generateTemplate: () => Promise<ContextMenuCommandTemplate>;
}
