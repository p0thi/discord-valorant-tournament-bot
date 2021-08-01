import {
  Collection,
  EmbedField,
  Guild,
  GuildChannel,
  GuildMember,
  LimitedCollection,
  Message,
  MessageActionRow,
  MessageButton,
  MessageEmbed,
  MessageEmbedThumbnail,
  MessageOptions,
  MessageSelectMenu,
  TextChannel,
  ThreadChannel,
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

export default class TournamentMessage {
  private static _threadMessageInstances = new Map<string, Message[]>();
  private static _mainMessageInstances = new Map<string, Message>();
  private static _editMessagesQueues = new Map<string, Queue>();

  guild: Guild;
  tournament: ITournamentSetting;
  parentManager: TournamentManager;

  private _threadMessages: Message[];
  private _mainMessage: Message;

  get uniqueTournamentId(): string {
    return `${this.guild.id}_${this.tournament.id}`;
  }

  private waitingForThreadMessages: Array<(result: Message[]) => void> = [];
  private waitingForMainMessage: Array<(result: Message) => void> = [];

  constructor(
    guild: Guild,
    tournament: ITournamentSetting,
    manager: TournamentManager
  ) {
    this.guild = guild;
    this.tournament = tournament;
    this.parentManager = manager;

    if (!TournamentMessage._editMessagesQueues.has(this.uniqueTournamentId)) {
      TournamentMessage._editMessagesQueues.set(
        this.uniqueTournamentId,
        new Queue()
      );
    }

    this.fetchOrCreateMessages();
  }

  private async fetchOrCreateMessages() {
    if (!this.tournament) {
      return;
    }
    let result: Message;

    if (
      TournamentMessage._mainMessageInstances.has(this.uniqueTournamentId) &&
      TournamentMessage._mainMessageInstances.get(this.uniqueTournamentId)
    ) {
      result = TournamentMessage._mainMessageInstances.get(
        this.uniqueTournamentId
      );
    } else if (this.tournament.mainMessageId) {
      let message;
      try {
        message = await (
          this.guild.channels.cache.get(
            this.tournament.channelId
          ) as TextChannel
        ).messages.fetch(this.tournament.mainMessageId);
      } catch (e) {
        message = await this.createMainMessage();
      }

      if (message) {
        result = message;
      } else {
        result = await this.createMainMessage();
      }
    } else {
      result = await this.createMainMessage();
    }

    this.mainMessage = result;
    if (this.tournament.mainMessageId !== result.id) {
      this.tournament.mainMessageId = result.id;
      await this.tournament.ownerDocument().save();
    }

    this.editAllMessages();
    // this.messages = result as Message[];
  }

  async getThread(): Promise<ThreadChannel> {
    const mainMessage = await this.getMainMessage();
    if (!mainMessage) {
      return;
    }
    const thread = await this.getThreadFromMessage(mainMessage);
    return thread;
  }

  async getThreadFromMessage(message: Message): Promise<ThreadChannel> {
    let result;
    if (message.hasThread) {
      result = message.thread;
    } else {
      try {
        result = await message.startThread({
          name: this.parentManager.tournament.name,
          autoArchiveDuration: message.guild.features.includes(
            "SEVEN_DAY_THREAD_ARCHIVE"
          )
            ? 10080
            : message.guild.features.includes("THREE_DAY_THREAD_ARCHIVE")
            ? 4320
            : 1440,
        });
      } catch (e) {
        try {
          return (await message.fetch(true)).thread;
        } catch (e) {
          return undefined;
        }
      }
    }
    return result;
  }

  private async getMainMessage(): Promise<Message> {
    return new Promise<Message>((resolve, reject) => {
      if (
        TournamentMessage._mainMessageInstances.has(this.uniqueTournamentId)
      ) {
        resolve(
          TournamentMessage._mainMessageInstances.get(this.uniqueTournamentId)
        );
        return;
      }
      this.waitingForMainMessage.push(resolve);
    });
  }

  private async getThreadMessages(): Promise<Message[]> {
    return new Promise<Message[]>(async (resolve, reject) => {
      const result = [];
      if (
        TournamentMessage._threadMessageInstances.has(this.uniqueTournamentId)
      ) {
        result.push(
          ...TournamentMessage._threadMessageInstances.get(
            this.uniqueTournamentId
          )
        );
      }
      if (this.tournament.messageIds && this.tournament.messageIds.length > 0) {
        const mainMessage = await this.getMainMessage();
        if (!mainMessage) {
          this.waitingForThreadMessages.push(resolve);
          return;
        }
        const thread = await this.getThreadFromMessage(mainMessage);
        for (const id of this.tournament.messageIds) {
          try {
            const message = await thread.messages.fetch(id);
            if (!result.find((m) => m.id === message.id)) {
              result.push(message);
              TournamentMessage._threadMessageInstances
                .get(this.uniqueTournamentId)
                .push(message);
            }
          } catch (e) {}
        }
      }
      if (
        !this.tournament.messageIds ||
        this.tournament.messageIds.length !== result.length ||
        !this.tournament.messageIds.every((id) =>
          result.find((m) => m.id === id)
        )
      ) {
        this.tournament.messageIds = result.map((m) => m.id);
        await this.tournament.ownerDocument().save();
      }

      resolve(result);
      this.threadMessages = result;
      return;
    });
  }

  private set threadMessages(value: Message[]) {
    this._threadMessages = value;
    TournamentMessage._threadMessageInstances.set(
      this.uniqueTournamentId,
      value
    );
    this.waitingForThreadMessages.forEach((observer) => observer(value));
  }

  private set mainMessage(value: Message) {
    this._mainMessage = value;
    TournamentMessage._mainMessageInstances.set(this.uniqueTournamentId, value);
    this.waitingForMainMessage.forEach((observer) => observer(value));
  }

  private async createMainMessage(): Promise<Message> {
    const channel = this.guild.channels.cache.get(
      this.tournament.channelId
    ) as TextChannel;
    const content = await this.mainMessageContent();
    const message = await channel.send(content);
    return message;
  }

  editAllMessages() {
    TournamentMessage._editMessagesQueues
      .get(this.uniqueTournamentId)
      .add(async () => {
        if (!(await this.parentManager.populateTournament())) {
          return;
        }

        try {
          const mainMessage = await this.getMainMessage();
          await mainMessage.edit(await this.mainMessageContent());
          mainMessage.suppressEmbeds(false);

          if (
            (
              (await this.guild.channels.fetch(
                this.tournament.channelId
              )) as TextChannel
            )
              .permissionsFor(this.guild.client.user)
              .has("MANAGE_MESSAGES")
          ) {
            mainMessage.pin();
          }

          const threadMessages = await this.getThreadMessages();

          const messageOptions = [...(await this.premadeMessageContent())];

          for (let i = 0; i < messageOptions.length; i++) {
            let newThreadMessages: Message[] = [];
            const thread = await this.getThreadFromMessage(mainMessage);
            if (threadMessages.length > i) {
              newThreadMessages.push(
                await threadMessages[i].edit(messageOptions[i])
              );
            } else {
              const createdMessage = await thread.send(messageOptions[i]);
              this.threadMessages = [...this._threadMessages, createdMessage];

              newThreadMessages.push(createdMessage);
              threadMessages.push(createdMessage);
            }
            newThreadMessages.forEach((m) => {
              m.suppressEmbeds(false);
              if (
                thread
                  .permissionsFor(this.guild.client.user)
                  .has("MANAGE_MESSAGES")
              ) {
                m.pin();
              }
            });
          }

          this.threadMessages = threadMessages;
          if (
            !this.tournament.messageIds ||
            this.tournament.messageIds.length !== threadMessages.length ||
            !this.tournament.messageIds.every((id) =>
              threadMessages.find((m) => m.id === id)
            )
          ) {
            this.tournament.messageIds = threadMessages.map((m) => m.id);
            await this.tournament.ownerDocument().save();
          }
        } catch (e) {
          console.error("Could not edit messages!");
        }
      });
  }

  async deleteAllMessages(): Promise<Message[]> {
    const mainMessage = await this.getMainMessage();

    const threadMessages = await this.getThreadMessages();
    this.getThreadFromMessage(mainMessage).then((thread) => {
      try {
        thread
          .delete("Messages got deleted")
          .catch((e) => console.error("could not delete thread"));
      } catch (e) {
        return undefined;
      }
    });
    mainMessage.delete();
    threadMessages.forEach((m) =>
      m
        .delete()
        .catch((e) => console.error("could not delete a tournament message."))
    );
    return [mainMessage, ...threadMessages];
  }

  private async mainMessageContent(): Promise<MessageOptions> {
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
    const participantMembers: Collection<string, GuildMember> =
      participants.length > 0
        ? await this.guild.members.fetch({
            user: participants.map((participant) => participant.discordId),
          })
        : new Collection();

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

  private async premadeMessageContent(): Promise<MessageOptions[]> {
    const populatedTournament = await this.parentManager.populateTournament();

    const participants = await Promise.all(
      populatedTournament.participants.map(async (p) => {
        return await dbManager.getUser({ _id: p.id });
      })
    );

    let selectMenuRows;

    if (populatedTournament.participants.length >= 5) {
      const discordMembers = await this.guild.members.fetch({
        user: participants.map((p) => p.discordId),
      });

      const labelMaxLength = 25;
      const descriptionMaxLength = 50;

      const selectOptions = [
        ...participants
          .map((participant) => {
            const discordMember = discordMembers.get(participant.discordId);
            const dbValoAccount = participant[
              `${this.tournament.region}_account`
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
            .setCustomId(`group_select#${this.uniqueTournamentId}_${i}`)
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
            .setCustomId(`group_select#${this.uniqueTournamentId}`)
            .setPlaceholder("Not enough participants to slect premades...")
            .setDisabled(true)
            .addOptions([{ label: "Player", value: "0" }]),
        ]),
      ];
    }

    const row2 = new MessageActionRow().addComponents([
      new MessageButton()
        .setCustomId(`leave_groups#${this.uniqueTournamentId}`)
        .setLabel("Reset my premade selection")
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

    return [
      {
        embeds: [embed1, ...groupEmbeds],
        components: [...selectMenuRows, row2],
      } as MessageOptions,
    ];
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

class Queue {
  running: () => void;
  autorun: boolean;
  queue: (() => void)[];

  constructor(autorun = true, queue: (() => Promise<any>)[] = []) {
    this.running = undefined;
    this.autorun = autorun;
    this.queue = queue;
  }

  add(cb: () => Promise<any>) {
    this.queue.push(() => {
      const finished = new Promise(async (resolve, reject) => {
        const callbackResponse = await cb();

        if (callbackResponse !== false) {
          resolve(callbackResponse);
        } else {
          reject(callbackResponse);
        }
      });

      finished.then(this.dequeue.bind(this), () => {});
    });

    if (this.autorun && !this.running) {
      this.dequeue();
    }

    return this;
  }

  dequeue() {
    this.running = this.queue.shift();

    if (this.running) {
      this.running();
    }

    return this.running;
  }

  get next() {
    return this.dequeue;
  }
}
