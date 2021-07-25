import { Guild } from "discord.js";
import IGuild from "../../db/interfaces/IGuild";
import { SlashCommandTemplate } from "../SlashCommandCreator";
import AObservableCommand from "./AObservableCommand";
import IGuildCommandObserver from "./IGuildCommandObserver";

export default interface IGuildCommand extends AObservableCommand {
  guild: Guild;
  generateTemplate: () => Promise<SlashCommandTemplate>;
}
