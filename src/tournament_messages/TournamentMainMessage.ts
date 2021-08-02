import {
  Collection,
  GuildMember,
  MessageActionRow,
  MessageButton,
  MessageOptions,
} from "discord.js";
import DatabaseManager from "../db/DatabaseManager";
import { ITournamentSetting } from "../db/interfaces/IGuild";
import TournamentManager from "../managers/TournamentManager";
import ITournamentMessage from "./ITournamentMessage";
import TournamentMessageManager from "../managers/TournamentMessageManager";

const dbManager = DatabaseManager.getInstance();

export default class TournamentMainMessage implements ITournamentMessage {
  async create(
    tournametMessage: TournamentMessageManager,
    populatedTournament: ITournamentSetting
  ): Promise<MessageOptions[]> {
    const row1 = new MessageActionRow().addComponents([
      new MessageButton()
        .setCustomId(`join_tournament#${tournametMessage.uniqueTournamentId}`)
        .setLabel("Join Tournament")
        .setStyle("PRIMARY"),
      new MessageButton()
        .setCustomId(`leave_tournament#${tournametMessage.uniqueTournamentId}`)
        .setLabel("Leave Tournament")
        .setStyle("DANGER"),
    ]);

    const participants = await Promise.all(
      populatedTournament.participants.map((participant) =>
        dbManager.getUser({ _id: participant })
      )
    );
    const participantMembers: Collection<string, GuildMember> =
      participants.length > 0
        ? await tournametMessage.guild.members.fetch({
            user: participants.map((participant) => participant.discordId),
          })
        : new Collection();

    const embed1 = {
      title: populatedTournament.name,
      author: {
        name: "Valorant Tournament",
      },
      description: `${populatedTournament.description || ""}`,
      color: "#00e1ff",
      fields: [
        {
          name: "Region:",
          value: `**${populatedTournament.region.toUpperCase()}**`,
        },
        {
          name: `Participants info: `,
          value: `Amount: ${
            populatedTournament.participants.length
          }\nAverage Elo: ${
            Math.ceil(
              participants
                .map((p) => {
                  const elo = tournametMessage.getDbUserMaxElo(p)?.elo || 0;
                  return elo > 0 ? elo : 750;
                })
                .reduce((a, b) => a + b, 0) / participants.length
            ) || 0
          }`,
        },
      ],
    };

    return [
      {
        embeds: [embed1],
        components: [row1],
      } as MessageOptions,
    ];
  }
}
