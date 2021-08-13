import IGuildSlashCommand, { IGuildContextMenuCommand } from "./IGuildCommand";

export default interface IGuildCommandObserver {
  commandChangeObserved(
    guildCommand: IGuildSlashCommand | IGuildContextMenuCommand
  );
}
