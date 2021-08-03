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
import TournamentCommand from "../commands/guild_commands/TournamentCommand";
import DatabaseManager from "../db/DatabaseManager";
import { ITournamentSetting } from "../db/interfaces/IGuild";
import IUser, { IValoAccountInfo } from "../db/interfaces/IUser";
import TournamentManager, {
  PremadeStatus,
  PremateStatusEmoji,
} from "./TournamentManager";
import emojis from "../util/emojis";
import TournamentMainMessage from "../tournament_messages/TournamentMainMessage";
import TournamentParticipantMessage from "../tournament_messages/TournamentParticipantMessage";
import TournamentPremadeMessage from "../tournament_messages/TournamentPremadeMessage";

const dbManager = DatabaseManager.getInstance();

export default class TournamentMessageManager {
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

    if (
      !TournamentMessageManager._editMessagesQueues.has(this.uniqueTournamentId)
    ) {
      TournamentMessageManager._editMessagesQueues.set(
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
      TournamentMessageManager._mainMessageInstances.has(
        this.uniqueTournamentId
      ) &&
      TournamentMessageManager._mainMessageInstances.get(
        this.uniqueTournamentId
      )
    ) {
      result = TournamentMessageManager._mainMessageInstances.get(
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
    let result: ThreadChannel;
    if (message.hasThread) {
      result = message.thread;
    } else {
      try {
        result = await message.startThread({
          name: `${this.tournament.region.toUpperCase()} - ${
            this.tournament.name
          }`,
          autoArchiveDuration: message.guild.features.includes(
            "SEVEN_DAY_THREAD_ARCHIVE"
          )
            ? 10080
            : message.guild.features.includes("THREE_DAY_THREAD_ARCHIVE")
            ? 4320
            : 1440,
        });
        result.setRateLimitPerUser(180);
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

  private async getMainMessage(): Promise<Message | undefined> {
    return new Promise<Message>((resolve, reject) => {
      if (
        TournamentMessageManager._mainMessageInstances.has(
          this.uniqueTournamentId
        )
      ) {
        resolve(
          TournamentMessageManager._mainMessageInstances.get(
            this.uniqueTournamentId
          )
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
        TournamentMessageManager._threadMessageInstances.has(
          this.uniqueTournamentId
        )
      ) {
        result.push(
          ...TournamentMessageManager._threadMessageInstances.get(
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
              TournamentMessageManager._threadMessageInstances
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
    TournamentMessageManager._threadMessageInstances.set(
      this.uniqueTournamentId,
      value
    );
    this.waitingForThreadMessages.forEach((observer) => observer(value));
  }

  private set mainMessage(value: Message) {
    this._mainMessage = value;
    TournamentMessageManager._mainMessageInstances.set(
      this.uniqueTournamentId,
      value
    );
    this.waitingForMainMessage.forEach((observer) => observer(value));
  }

  private async createMainMessage(): Promise<Message> {
    const channel = this.guild.channels.cache.get(
      this.tournament.channelId
    ) as TextChannel;
    const content = await new TournamentMainMessage().create(
      this,
      await this.parentManager.populateTournament()
    );
    const message = await channel.send(content[0]);
    return message;
  }

  editAllMessages() {
    TournamentMessageManager._editMessagesQueues
      .get(this.uniqueTournamentId)
      .add(async () => {
        if (!(await this.parentManager.populateTournament())) {
          return;
        }
        const mainMessage = await this.getMainMessage();

        if (!mainMessage) {
          return;
        }
        const thread = await this.getThreadFromMessage(mainMessage);

        if (thread.archived) {
          return;
        }

        const populatedTournament =
          await this.parentManager.populateTournament();

        try {
          const mainMessageContent = await new TournamentMainMessage().create(
            this,
            populatedTournament
          );
          await mainMessage.edit(mainMessageContent[0]);
          mainMessage.suppressEmbeds(false);

          const threadMessages = await this.getThreadMessages();

          const messageOptions = [
            ...(await new TournamentParticipantMessage().create(
              this,
              populatedTournament
            )),
            ...(await new TournamentPremadeMessage().create(
              this,
              populatedTournament
            )),
          ];

          let newThreadMessages: Message[] = [];
          for (let i = 0; i < messageOptions.length; i++) {
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
          }

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
    try {
      const mainMessage = await this.getMainMessage();

      if (!mainMessage) {
        return [];
      }

      const threadMessages = await this.getThreadMessages();
      const thread = await this.getThreadFromMessage(mainMessage);
      await Promise.allSettled(
        threadMessages.map((m) => m.edit({ components: [] }))
      );
      thread
        .setArchived(true)
        .catch((e) => console.error("could not delete thread"));
      mainMessage.delete();
      this.mainMessage = null;
      return [mainMessage, ...threadMessages];
    } catch (e) {
      return undefined;
    }
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
