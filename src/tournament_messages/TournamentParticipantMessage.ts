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
    const participantMembers: Collection<string, GuildMember> =
      populatedTournament.participants.length > 0
        ? await tournamentManager.guild.members.fetch({
            user: populatedTournament.participants.map(
              (participant) => participant.discordId
            ),
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
            populatedTournament.participants.length > 0
              ? "\n" +
                participantMembers
                  .map((participant, index) => {
                    const user = populatedTournament.participants.find(
                      (p) => p.discordId === index
                    );
                    const [maxEloValoAccountInfo, region] =
                      dbManager.getDbUserMaxElo(user);
                    const regionValoAccountInfo =
                      user[`${populatedTournament.region}_account`];
                    const participantMention = `<@${participant.id}>`;
                    const valoAccountInfoMention =
                      region === populatedTournament.region
                        ? `<:${
                            emojis
                              .find(
                                (e) =>
                                  e?.tier === maxEloValoAccountInfo.currenttier
                              )
                              .getValoEmoji(tournamentManager.guild.client)
                              .identifier
                          }>${maxEloValoAccountInfo.elo}`
                        : `${region.toUpperCase()}: <:${
                            emojis
                              .find(
                                (e) =>
                                  e?.tier === maxEloValoAccountInfo.currenttier
                              )
                              .getValoEmoji(tournamentManager.guild.client)
                              .identifier
                          }>${
                            maxEloValoAccountInfo.elo
                          } | ${populatedTournament.region.toUpperCase()}: ${
                            regionValoAccountInfo.elo
                          }`;
                    return ` ${participantMention}(${valoAccountInfoMention})`;
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
