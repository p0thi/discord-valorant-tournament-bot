import { Guild } from "discord.js";
import IGuild from "../../db/interfaces/IGuild";
import IGuildCommand from "./IGuildCommand";

export default interface IGuildCommandObserver {
  commandChangeObserved(guildCommand: IGuildCommand);
}
