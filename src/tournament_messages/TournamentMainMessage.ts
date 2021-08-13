import {
  Collection,
  GuildMember,
  Message,
  MessageActionRow,
  MessageButton,
  MessageOptions,
} from "discord.js";
import DatabaseManager from "../db/DatabaseManager";
import { ITournamentSetting } from "../db/interfaces/IGuild";
import TournamentManager from "../managers/TournamentManager";
import ITournamentMessage from "./ITournamentMessage";
import TournamentMessageManager from "../managers/TournamentMessageManager";

export default class TournamentMainMessage implements ITournamentMessage {
  async create(
    tournametMessage: TournamentMessageManager,
    populatedTournament: ITournamentSetting,
    messages: Message[]
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
      new MessageButton()
        .setCustomId(`tournament_help#${tournametMessage.uniqueTournamentId}`)
        .setEmoji("❔")
        .setStyle("SECONDARY"),
    ]);

    const row2 = new MessageActionRow();

    if (messages && messages.length > 0) {
      if (messages[0] && "url" in messages[0]) {
        row2.addComponents([
          new MessageButton()
            .setLabel("⏬ Participants List")
            .setStyle("LINK")
            .setURL(messages[0].url),
        ]);
      }
      if (messages.length > 1 && messages[1] && "url" in messages[1]) {
        row2.addComponents([
          new MessageButton()
            .setLabel("⏬ Premades")
            .setStyle("LINK")
            .setURL(messages[1].url),
        ]);
      }
    }

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
              populatedTournament.participants
                .map((p) => {
                  const elo =
                    DatabaseManager.getInstance().getDbUserMaxElo(p)[0]?.elo ||
                    0;
                  return elo > 0 ? elo : 750;
                })
                .reduce((a, b) => a + b, 0) /
                populatedTournament.participants.length
            ) || 0
          }`,
        },
      ],
    };

    const result = {
      embeds: [embed1],
      components: [row1, ...(row2.components.length > 0 ? [row2] : [])],
    } as MessageOptions;

    return [result];
  }
}
