import { Message, MessageOptions } from "discord.js";
import { create } from "domain";
import { ITournamentSetting } from "../db/interfaces/IGuild";
import TournamentMessageManager from "../managers/TournamentMessageManager";

export default interface ITournamentMessage {
  create(
    tournamentManager: TournamentMessageManager,
    populatedTournament: ITournamentSetting,
    messages: Message[],
    startId: number
  ): Promise<MessageOptions[]>;
}
