import {
  EmbedField,
  Guild,
  GuildChannel,
  Message,
  MessageActionRow,
  MessageButton,
  MessageEmbed,
  MessageEmbedThumbnail,
  MessageOptions,
  MessageSelectMenu,
  TextChannel,
} from "discord.js";
import { MessageButtonStyles } from "discord.js/typings/enums";
import DatabaseManager from "./db/DatabaseManager";
import { ITournamentSetting } from "./db/interfaces/IGuild";
import IUser, { IValoAccountInfo } from "./db/interfaces/IUser";
import TournamentManager, {
  PremadeStatus,
  PremateStatusEmoji,
} from "./managers/TournamentManager";
import emojis from "./util/emojis";

const dbManager = DatabaseManager.getInstance();
type messagesArray = [Message, Message];

export default class TournamentMessage {
  private static _messageInstances = new Map<string, messagesArray>();

  guild: Guild;
  tournament: ITournamentSetting;
  parentManager: TournamentManager;

  private _messages: messagesArray = [undefined, undefined];
  private key: string;

  get uniqueTournamentId(): string {
    return `${this.guild.id}_${this.tournament.id}`;
  }

  private waitingForMessages: Array<(result: messagesArray) => void> = [];

  constructor(
    guild: Guild,
    tournament: ITournamentSetting,
    manager: TournamentManager
  ) {
    this.guild = guild;
    this.tournament = tournament;
    this.parentManager = manager;

    this.key = `${guild.id}-${tournament.id}`;

    this.fetchOrCreateMessages();
  }

  private async fetchOrCreateMessages() {
    if (!TournamentMessage._messageInstances.has(this.key)) {
      TournamentMessage._messageInstances.set(this.key, [undefined, undefined]);
    }

    const result: messagesArray = [undefined, undefined];

    for (let i = 0; i < result.length; i++) {
      const messageInstance = TournamentMessage._messageInstances.get(this.key)[
        i
      ];
      if (messageInstance) {
        result[i] = messageInstance;
        continue;
      } else if (
        this.tournament.messageIds &&
        this.tournament.messageIds.length > i
      ) {
        let message;
        try {
          message = await (
            this.guild.channels.cache.get(
              this.tournament.channelId
            ) as TextChannel
          ).messages.fetch(this.tournament.messageIds[i]);
        } catch (e) {
          result[i] = await this.createMessage(i);
          continue;
        }

        if (message) {
          result[i] = message;
          continue;
        } else {
          result[i] = await this.createMessage(i);
          continue;
        }
      } else {
        result[i] = await this.createMessage(i);
        continue;
      }
    }

    let shouldSaveDocument = !result.every(
      (message, index) =>
        this.tournament.messageIds &&
        this.tournament.messageIds.length === result.length &&
        message.id === this.tournament.messageIds[index]
    );

    if (shouldSaveDocument) {
      this.tournament.messageIds = result.map((m) => m.id);
      await this.tournament.ownerDocument().save();
    }
    console.log(this.tournament.messageIds);
    this.messages = result as messagesArray;
  }

  public getMessages(): Promise<messagesArray> {
    const result = new Promise<messagesArray>((resolve, reject) => {
      if (this._messages && this._messages.every((m) => !!m)) {
        resolve(this._messages);
      } else {
        this.waitingForMessages.push(resolve);
      }
    });
    return result;
  }

  private set messages(value: messagesArray) {
    this._messages = value;
    TournamentMessage._messageInstances.set(this.key, value);
    this.waitingForMessages.forEach((observer) => observer(value));
  }

  private async createMessage(index: number): Promise<Message> {
    switch (index) {
      case 0:
        return await (
          this.guild.channels.cache.get(
            this.tournament.channelId
          ) as TextChannel
        ).send(await this.mainMessageContent());
      case 1:
        return await (
          this.guild.channels.cache.get(
            this.tournament.channelId
          ) as TextChannel
        ).send(await this.premadeMessageContent());
    }
  }

  async editAllMessages() {
    const messages = await this.getMessages();
    this.editMainMessage(messages[0]);
    this.editPremadeMessage(messages[1]);
  }

  async editMainMessage(message: Message) {
    message.edit(await this.mainMessageContent());
    message.suppressEmbeds(false);
  }

  async editPremadeMessage(message: Message) {
    message.edit(await this.premadeMessageContent());
    message.suppressEmbeds(false);
  }

  async deleteAllMessages() {
    const messages = await this.getMessages();
    await Promise.all(messages.map((m) => m.delete()));
  }

  private async mainMessageContent(): Promise<MessageOptions> {
    this.tournament;
    const row1 = new MessageActionRow().addComponents([
      new MessageButton()
        .setCustomId(`join_tournament#${this.uniqueTournamentId}`)
        .setLabel("Join Tournament")
        .setStyle("PRIMARY"),
      new MessageButton()
        .setCustomId(`leave_tournament#${this.uniqueTournamentId}`)
        .setLabel("Leave Tournament")
        .setStyle("DANGER"),
    ]);

    const participants = await Promise.all(
      this.tournament.participants.map((participant) =>
        dbManager.getUser({ _id: participant })
      )
    );
    const participantMembers = await this.guild.members.fetch({
      user: participants.map((participant) => participant.discordId),
    });

    const embed1 = {
      title: this.tournament.name,
      author: {
        name: "Valorant Tournament",
      },
      description: `${this.tournament.description || ""}`,
      color: "#00e1ff",
      fields: [
        {
          name: "Region:",
          value: `**${this.tournament.region.toUpperCase()}**`,
        },
        {
          name: `Participants: **${
            this.tournament.participants.length
          }** *(Average Elo: ${
            Math.ceil(
              participants
                .map((p) => {
                  const elo = this.getDbUserMaxElo(p)?.elo || 0;
                  return elo > 0 ? elo : 750;
                })
                .reduce((a, b) => a + b, 0) / participants.length
            ) || 0
          })*`,
          value:
            participants.length > 0
              ? "\n" +
                participantMembers
                  .map((participant, index) => {
                    const user = participants.find(
                      (p) => p.discordId === index
                    );
                    const valoAccountInfo = this.getDbUserMaxElo(
                      user
                    ) as IValoAccountInfo;
                    return ` <@${participant.id}>(<:${
                      emojis
                        .find((e) => e?.tier === valoAccountInfo.currenttier)
                        .getValoEmoji(this.guild.client).identifier
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

    return {
      embeds: [embed1],
      components: [row1],
    } as MessageOptions;
  }

  private async premadeMessageContent(): Promise<MessageOptions> {
    const joinGroupMenu = new MessageSelectMenu().setCustomId(
      `group_select#${this.uniqueTournamentId}`
    );

    const populatedTournament = await this.parentManager.populateTournament();

    const participants = await Promise.all(
      populatedTournament.participants.map(async (p) => {
        return await dbManager.getUser({ _id: p });
      })
    );
    if (populatedTournament.participants.length >= 5) {
      const discordMembers = await this.guild.members.fetch({
        user: participants.map((p) => p.discordId),
      });

      joinGroupMenu
        .setPlaceholder("Select your favourite premade group")
        .setMaxValues(5)
        .setMinValues(1)
        .addOptions([
          {
            label: "NONE",
            description: "Select, if you don't want to be in a group at all.",
            value: "none",
          },
          ...participants
            .map((participant) => {
              const discordMember = discordMembers.get(participant.discordId);
              const dbValoAccount = participant[
                `${this.tournament.region}_account`
              ] as IValoAccountInfo;

              return {
                label: `${discordMember.displayName}#${discordMember.user.discriminator}`,
                description: `${dbValoAccount.name}#${dbValoAccount.tag} | ${dbValoAccount.currenttierpatched}`,
                value: discordMember.id,
              };
            })
            .sort((a, b) => a.label.localeCompare(b.label)),
        ]);
    } else {
      joinGroupMenu
        .setPlaceholder("Not enough participants to slect premades...")
        .setDisabled(true)
        .addOptions([{ label: "Player", value: "0" }]);
    }

    const row1 = new MessageActionRow().addComponents([joinGroupMenu]);
    const row2 = new MessageActionRow().addComponents([
      new MessageButton()
        .setCustomId(`leave_groups#${this.uniqueTournamentId}`)
        .setLabel("Leave all premade groups")
        .setStyle("SECONDARY"),
    ]);

    const embed1 = {
      title: `${populatedTournament.name} - Premade Groups`,
      description: "Groups of players, who want to play in one team.",
      color: "#008ea1",
      fields: [
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
          value: "Not all of the players selected premades are in this group.",
        },
        {
          name: `${PremateStatusEmoji.get(PremadeStatus.CONFLICT)} Conflict`,
          inline: false,
          value: "None of the players selected premades are in this group.",
        },
        // { name: "\u200b", value: "\u200b" },
        {
          name: "Players who chose to stay out of any premade groups.",
          value:
            populatedTournament.premades
              .filter((p) => !p.target)
              .map((p) => `<@${p.issuer.discordId}>`)
              .join(", ") || "None",
        },
      ],
    };

    const participantHighestValorantAccounts = participants.map(
      (p) => this.getDbUserMaxElo(p) as IValoAccountInfo
    );

    const allParticipantsAverageElo =
      participantHighestValorantAccounts
        .map((p) => p.elo)
        .reduce((a, b) => a + b, 0) / participantHighestValorantAccounts.length;

    const groupEmbeds = (await this.parentManager.getPremadeGroups()).map(
      (g, i) => {
        const availablePremades = g.filter((p) => p.status < 1);
        const nonAvailablePremades = g.filter((p) => p.status >= 1);

        const groupParticipants = participants.filter((p) =>
          availablePremades.find((x) => x.participant.discordId === p.discordId)
        );

        const groupAverageElo = Math.ceil(
          groupParticipants
            .map((p) => {
              const maxElo = this.getDbUserMaxElo(p).elo as number;
              return maxElo > 0 ? maxElo : 750;
            })
            .reduce((a, c) => a + c, 0) / availablePremades.length
        );

        return {
          title: `Group ${i + 1}`,
          description: `Size: **${
            availablePremades.length
          }**\nAverage Elo of accepted players: **${groupAverageElo}** \`(${Math.abs(
            groupAverageElo - allParticipantsAverageElo
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
                            .getValoEmoji(this.guild.client).identifier
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
        };
      }
    );

    return {
      embeds: [embed1, ...groupEmbeds],
      components: [row1, row2],
    } as MessageOptions;
  }

  getDbUserMaxElo(dbUser: IUser): IValoAccountInfo {
    let currentResult;

    for (const region of ["na", "eu", "kr", "ap"]) {
      if (`${region}_account` in dbUser) {
        const currentValoAccount = dbUser[`${region}_account`];
        if (
          !currentResult ||
          (currentValoAccount && currentValoAccount.elo > currentResult.elo)
        )
          currentResult = currentValoAccount;
      }
    }

    return currentResult;
  }
}
