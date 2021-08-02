import { Collection, GuildMember, MessageOptions } from "discord.js";
import DatabaseManager from "../db/DatabaseManager";
import { ITournamentSetting } from "../db/interfaces/IGuild";
import { IValoAccountInfo } from "../db/interfaces/IUser";
import TournamentMessageManager from "../managers/TournamentMessageManager";
import emojis from "../util/emojis";
import ITournamentMessage from "./ITournamentMessage";

const dbManager = DatabaseManager.getInstance();

export default class TournamentParticipantMessage
  implements ITournamentMessage
{
  async create(
    tournamentManager: TournamentMessageManager,
    populatedTournament: ITournamentSetting
  ): Promise<MessageOptions[]> {
    const participants = await Promise.all(
      populatedTournament.participants.map((participant) =>
        dbManager.getUser({ _id: participant })
      )
    );
    const participantMembers: Collection<string, GuildMember> =
      participants.length > 0
        ? await tournamentManager.guild.members.fetch({
            user: participants.map((participant) => participant.discordId),
          })
        : new Collection();

    const embed1 = {
      title: `${populatedTournament.name} - Participants`,
      description: `The paritcipants of the tournament.`,
      color: "#00e1ff",
      fields: [
        {
          name: `Participants:`,
          value:
            participants.length > 0
              ? "\n" +
                participantMembers
                  .map((participant, index) => {
                    const user = participants.find(
                      (p) => p.discordId === index
                    );
                    const valoAccountInfo = tournamentManager.getDbUserMaxElo(
                      user
                    ) as IValoAccountInfo;
                    return ` <@${participant.id}>(<:${
                      emojis
                        .find((e) => e?.tier === valoAccountInfo.currenttier)
                        .getValoEmoji(tournamentManager.guild.client).identifier
                    }>${
                      valoAccountInfo?.elo > 0
                        ? valoAccountInfo.elo
                        : "Estimated: 750"
                    })`;
                  })
                  .join(", ")
              : "\u200b",
        },
      ],
    };

    return [
      {
        embeds: [embed1],
      } as MessageOptions,
    ];
  }
}
