import {
  Message,
  MessageActionRow,
  MessageButton,
  MessageEmbed,
  MessageOptions,
  MessageSelectMenu,
} from "discord.js";
import DatabaseManager from "../db/DatabaseManager";
import { ITournamentSetting } from "../db/interfaces/IGuild";
import IUser, { IValoAccountInfo } from "../db/interfaces/IUser";
import {
  PremadeStatus,
  PremateStatusEmoji,
} from "../managers/TournamentManager";
import TournamentMessageManager from "../managers/TournamentMessageManager";
import emojis from "../util/emojis";
import ITournamentMessage from "./ITournamentMessage";

const dbManager = DatabaseManager.getInstance();
const minParticipants = 2;

export default class TournamentPremadeMessage implements ITournamentMessage {
  async create(
    tournamentManager: TournamentMessageManager,
    populatedTournament: ITournamentSetting,
    messages: Message[],
    startId: number
  ): Promise<MessageOptions[]> {
    let selectMenuRows;

    if (populatedTournament.participants.length >= minParticipants) {
      const discordMembers = await tournamentManager.guild.members.fetch({
        user: populatedTournament.participants.map((p) => p.discordId),
      });

      const labelMaxLength = 25;
      const descriptionMaxLength = 50;

      populatedTournament.participants.remove(
        ...populatedTournament.participants.filter(
          (p) => !discordMembers.has(p.discordId)
        )
      );

      const selectOptions = [
        ...populatedTournament.participants
          .map((participant) => {
            const discordMember = discordMembers.get(participant.discordId);
            const dbValoAccount = participant[
              `${populatedTournament.region}_account`
            ] as IValoAccountInfo;
            let label = `${discordMember.displayName}#${discordMember.user.discriminator}`;
            label =
              label.length > labelMaxLength
                ? label.substring(0, labelMaxLength - 1) + "…"
                : label;

            let description = `${dbValoAccount.name}#${dbValoAccount.tag} | ${dbValoAccount.currenttierpatched}`;
            description =
              description.length > descriptionMaxLength
                ? description.substring(0, descriptionMaxLength - 1) + "…"
                : description;
            return {
              label,
              description,
              value: discordMember.id,
            };
          })
          .sort((a, b) => a.label.localeCompare(b.label)),
      ];

      const perChunk = 25;
      const selectMenuChunks = selectOptions.reduce(
        (resultArray, item, index) => {
          const chunkIndex = Math.floor(index / perChunk);

          if (!resultArray[chunkIndex]) {
            resultArray[chunkIndex] = [];
          }

          resultArray[chunkIndex].push(item);

          return resultArray;
        },
        []
      );

      selectMenuRows = selectMenuChunks.map((chunk, i) => {
        return new MessageActionRow().addComponents([
          new MessageSelectMenu()
            .setCustomId(
              `group_select#${tournamentManager.uniqueTournamentId}_${i}`
            )
            .setPlaceholder(
              `Select premades` +
                (selectMenuChunks.length > 1
                  ? `: ${chunk[0].label.substring(0, 2).toUpperCase()}` +
                    (chunk.length > 1
                      ? ` - ${chunk[chunk.length - 1].label
                          .substring(0, 2)
                          .toUpperCase()}`
                      : "")
                  : "")
            )
            .setMinValues(1)
            .setMaxValues(chunk.length)
            .addOptions(chunk),
        ]);
      });
    } else {
      selectMenuRows = [
        new MessageActionRow().addComponents([
          new MessageSelectMenu()
            .setCustomId(`group_select#${tournamentManager.uniqueTournamentId}`)
            .setPlaceholder("Not enough participants to select premades...")
            .setDisabled(true)
            .addOptions([{ label: "Player", value: "0" }]),
        ]),
      ];
    }

    const premadeGroups =
      await tournamentManager.parentManager.getPremadeGroups();

    const embed1 = {
      title: `${populatedTournament.name} - Premade Groups`,
      description: "Groups of players, who want to play in one team.",
      color: "#008ea1",
      fields: [
        ...(populatedTournament.participants.length >= minParticipants &&
        premadeGroups.length > 0
          ? [
              {
                name: `${PremateStatusEmoji.get(PremadeStatus.READY)} Accepted`,
                inline: false,
                value:
                  "Player accepted to be in this group by selection one or more of the other players as premades.",
              },
              {
                name: `${PremateStatusEmoji.get(PremadeStatus.PENDIG)} Pending`,
                inline: false,
                value:
                  "Player needs to accept to play in that group, by chosing at least one player of that group as a premade.",
              },
              {
                name: `${PremateStatusEmoji.get(
                  PremadeStatus.INCOMPLETE
                )} Incomplete`,
                inline: false,
                value:
                  "Not all of the players selected premades are in this group.",
              },
              {
                name: `${PremateStatusEmoji.get(
                  PremadeStatus.CONFLICT
                )} Conflict`,
                inline: false,
                value:
                  "None of the players selected premades are in this group.",
              },
            ]
          : []),
      ],
    };

    const row2 = new MessageActionRow().addComponents([
      new MessageButton()
        .setCustomId(`leave_groups#${tournamentManager.uniqueTournamentId}`)
        .setLabel("Reset my premade selection")
        .setStyle("SECONDARY"),
      ...(messages.length >= startId + 1 &&
      !!messages[startId + 1] &&
      premadeGroups.length > 0
        ? [
            new MessageButton()
              .setStyle("LINK")
              .setLabel("Groups 1 - 10 ➡️")
              .setURL(messages[startId + 1].url),
          ]
        : []),
    ]);

    const result: MessageOptions[] = [
      {
        embeds: [embed1],
        components: [...selectMenuRows, row2],
      } as MessageOptions,
    ];

    const participantHighestValorantAccounts =
      populatedTournament.participants.map(
        (p) => dbManager.getDbUserMaxElo(p)[0]
      );

    populatedTournament.region;

    const allParticipantsAverageElo =
      participantHighestValorantAccounts
        .map((p) => p.elo)
        .reduce((a, b) => a + b, 0) / participantHighestValorantAccounts.length;

    const groupEmbeds = premadeGroups.map((g, i) => {
      // const groupEmbeds = Array(11)
      //   .fill((await tournamentManager.parentManager.getPremadeGroups())[0])
      //   .map((g, i) => {
      const availablePremades = g.filter((p) => p.status < 1);
      const nonAvailablePremades = g.filter((p) => p.status >= 1);

      const groupParticipants = populatedTournament.participants.filter((p) =>
        availablePremades.find((x) => x.participant.discordId === p.discordId)
      );

      const groupAverageElo = Math.ceil(
        groupParticipants
          .map((p) => {
            const maxElo = dbManager.getDbUserMaxElo(p)[0].elo;
            return maxElo > 0 ? maxElo : 750;
          })
          .reduce((a, c) => a + c, 0) / availablePremades.length
      );

      return new MessageEmbed({
        title: `Group ${i + 1}`,
        description: `Size: **${
          availablePremades.length
        }**\nAverage Elo of accepted players: **${groupAverageElo}** \`(${Math.ceil(
          Math.abs(groupAverageElo - allParticipantsAverageElo)
        )} ${
          groupAverageElo >= allParticipantsAverageElo ? "Above" : "Below"
        } average)\``,
        fields: [
          ...(availablePremades.length > 0
            ? [
                {
                  name: `${PremateStatusEmoji.get(
                    PremadeStatus.READY
                  )} Accepted`,
                  value: availablePremades
                    .map((p) => {
                      return `<:${
                        emojis
                          .find(
                            (e) =>
                              e?.tier ===
                              p.participant[
                                `${populatedTournament.region}_account`
                              ].currenttier
                          )
                          .getValoEmoji(tournamentManager.guild.client)
                          .identifier
                      }><@${p.participant.discordId}>`;
                    })
                    .join(", "),
                },
              ]
            : []),
          ...(nonAvailablePremades.length > 0
            ? [
                {
                  name: "Pending / Incomplete / Conflict",
                  value: nonAvailablePremades
                    .map((p) => {
                      return `${PremateStatusEmoji.get(p.status)}<@${
                        p.participant.discordId
                      }>`;
                    })
                    .join(", "),
                },
              ]
            : []),
        ],
      });
    });

    let lastMessageOptions = result[result.length - 1];
    for (const [i, groupEmbed] of groupEmbeds.entries()) {
      const hasPrev = i != 0 && messages.length >= startId + result.length;
      const hasNext = messages.length >= startId + result.length + 1;
      if (result.length <= 1) {
        result.push(
          this.prepareMessageOption(
            hasPrev ? messages[startId + result.length - 1] : undefined,
            hasNext ? messages[startId + result.length + 1] : undefined,
            hasPrev
              ? `${(result.length - 2) * 10 + 1} - ${(result.length - 1) * 10}`
              : undefined,
            hasNext
              ? `${result.length * 10 + 1} - ${result.length * 10}`
              : undefined
          )
        );
        lastMessageOptions = result[result.length - 1];
      }
      if (
        lastMessageOptions.embeds.length !== 0 &&
        (lastMessageOptions.embeds
          .map((e) => (e as MessageEmbed).length)
          .reduce((a, b) => a + b, 0) +
          groupEmbed.length >
          6000 ||
          lastMessageOptions.embeds.length >= 10)
      ) {
        const newMessageOptions = this.prepareMessageOption(
          hasPrev ? messages[startId + result.length - 1] : undefined,
          hasNext ? messages[startId + result.length + 1] : undefined,
          hasPrev
            ? `${(result.length - 2) * 10 + 1} - ${(result.length - 1) * 10}`
            : undefined,
          hasNext
            ? `${result.length * 10 + 1} - ${result.length * 10}`
            : undefined
        );

        console.log(1);
        result.push(newMessageOptions);
        lastMessageOptions = newMessageOptions;
      }
      lastMessageOptions.embeds.push(groupEmbed);
    }

    return result;
  }

  private prepareMessageOption(
    prevMessage: Message,
    nextMessage: Message,
    prevNumbers: string,
    nextNumbers: string
  ): MessageOptions {
    return {
      content: undefined,
      components: [
        ...(!!prevMessage || !!nextMessage
          ? [
              new MessageActionRow().addComponents([
                ...(!!prevMessage
                  ? [
                      new MessageButton()
                        .setStyle("LINK")
                        .setLabel(`⬅️ Groups ${prevNumbers}`)
                        .setURL(prevMessage.url),
                    ]
                  : [
                      new MessageButton()
                        .setStyle("LINK")
                        .setURL("https://example.com/")
                        .setLabel("⬅️ Not available")
                        .setDisabled(),
                    ]),
                ...(!!nextMessage
                  ? [
                      new MessageButton()
                        .setStyle("LINK")
                        .setLabel(`Groupss ${nextNumbers} ➡️`)
                        .setURL(nextMessage.url),
                    ]
                  : [
                      new MessageButton()
                        .setStyle("LINK")
                        .setURL("https://example.com/")
                        .setLabel("Not available ➡️")
                        .setDisabled(),
                    ]),
              ]),
            ]
          : []),
      ],
      embeds: [],
    };
  }
}
