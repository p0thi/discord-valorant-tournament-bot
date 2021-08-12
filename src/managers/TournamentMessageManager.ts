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
import TournamentMainMessage from "../tournament_messages/TournamentMainMessage";
import TournamentParticipantMessage from "../tournament_messages/TournamentParticipantMessage";
import TournamentPremadeMessage from "../tournament_messages/TournamentPremadeMessage";

const dbManager = DatabaseManager.getInstance();

export default class TournamentMessageManager {
  private static _threadMessageInstances = new Map<string, Message[]>();
  private static _messageInstances = new Map<string, Message[]>();
  private static _mainMessageInstances = new Map<string, Message>();

  private static _editMessagesQueues = new Map<string, Queue>();

  guild: Guild;
  parentManager: TournamentManager;

  private _threadMessages: Message[];
  private _messages: Message[];
  private _mainMessage: Message;

  get uniqueTournamentId(): string {
    return `${this.guild.id}_${this.parentManager.tournament.id}`;
  }

  private waitingForThreadMessages: Array<(result: Message[]) => void> = [];
  private waitingForMessages: Array<(result: Message[]) => void> = [];
  private waitingForMainMessage: Array<(result: Message) => void> = [];

  constructor(guild: Guild, manager: TournamentManager) {
    this.guild = guild;
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
    if (!this.parentManager.tournament) {
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
    } else if (this.parentManager.tournament.mainMessageId) {
      let message;
      try {
        message = await (
          this.guild.channels.cache.get(
            this.parentManager.tournament.channelId
          ) as TextChannel
        ).messages.fetch(this.parentManager.tournament.mainMessageId);
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
    if (this.parentManager.tournament.mainMessageId !== result.id) {
      this.parentManager.tournament.mainMessageId = result.id;
      await this.parentManager.tournament.ownerDocument().save();
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
          name: `${this.parentManager.tournament.region.toUpperCase()} - ${
            this.parentManager.tournament.name
          }`,
          autoArchiveDuration: message.guild.features.includes(
            "SEVEN_DAY_THREAD_ARCHIVE"
          )
            ? 10080
            : message.guild.features.includes("THREE_DAY_THREAD_ARCHIVE")
            ? 4320
            : 1440,
        });
        // result.setRateLimitPerUser(180);
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

  private async getMessages(): Promise<Message[]> {
    return new Promise<Message[]>(async (resolve, reject) => {
      const result: Message[] = [];
      if (
        TournamentMessageManager._messageInstances.has(this.uniqueTournamentId)
      ) {
        result.push(
          ...TournamentMessageManager._messageInstances.get(
            this.uniqueTournamentId
          )
        );
      }
      if (
        this.parentManager.tournament.messageIds &&
        this.parentManager.tournament.messageIds.length > 0
      ) {
        const mainMessage = await this.getMainMessage();
        if (!mainMessage) {
          this.waitingForMessages.push(resolve);
          return;
        }
        const mainChannel = mainMessage.channel as TextChannel;
        for (const id of this.parentManager.tournament.messageIds) {
          if (result.find((m) => m.id === id)) {
            continue;
          }
          try {
            const message = await mainChannel.messages
              .fetch(id)
              .catch((e) => console.log("Could not fetch message:", e.message));
            if (message && !result.find((m) => m.id === message.id)) {
              result.push(message);
              TournamentMessageManager._messageInstances
                .get(this.uniqueTournamentId)
                .push(message);
            }
          } catch (e) {}
        }
      }
      if (
        !this.parentManager.tournament.messageIds ||
        this.parentManager.tournament.messageIds.length !== result.length ||
        !this.parentManager.tournament.messageIds.every((id) =>
          result.find((m) => m.id === id)
        )
      ) {
        this.parentManager.tournament.messageIds = result.map((m) => m.id);
        await this.parentManager.tournament.ownerDocument().save();
      }

      resolve(result);
      this.messages = result;
      return;
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
      if (
        this.parentManager.tournament.threadMessageIds &&
        this.parentManager.tournament.threadMessageIds.length > 0
      ) {
        const mainMessage = await this.getMainMessage();
        if (!mainMessage) {
          this.waitingForThreadMessages.push(resolve);
          return;
        }
        const thread = await this.getThreadFromMessage(mainMessage);
        for (const id of this.parentManager.tournament.threadMessageIds) {
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
        !this.parentManager.tournament.threadMessageIds ||
        this.parentManager.tournament.threadMessageIds.length !==
          result.length ||
        !this.parentManager.tournament.threadMessageIds.every((id) =>
          result.find((m) => m.id === id)
        )
      ) {
        this.parentManager.tournament.threadMessageIds = result.map(
          (m) => m.id
        );
        await this.parentManager.tournament.ownerDocument().save();
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

  private set messages(value: Message[]) {
    this._messages = value;
    TournamentMessageManager._messageInstances.set(
      this.uniqueTournamentId,
      value
    );
    this.waitingForMessages.forEach((observer) => observer(value));
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
      this.parentManager.tournament.channelId
    ) as TextChannel;
    const content = await new TournamentMainMessage().create(
      this,
      await this.parentManager.populateTournament(),
      []
    );
    const message = await channel.send(content[0]);
    return message;
  }

  editAllMessages() {
    TournamentMessageManager._editMessagesQueues
      .get(this.uniqueTournamentId)
      .add(async () => {
        const populatedTournament =
          await this.parentManager.populateTournament();
        if (!populatedTournament) {
          return;
        }
        console.log("Editing messages...");
        const promisesToWaitFor: Promise<any>[] = [];
        const mainMessage = await this.getMainMessage();

        if (!mainMessage) {
          return;
        }
        const thread = await this.getThreadFromMessage(mainMessage);

        if (thread.archived) {
          return;
        }

        try {
          const threadMessages = await this.getThreadMessages();
          const messages = await this.getMessages();

          const participantMessages =
            await new TournamentParticipantMessage().create(
              this,
              populatedTournament,
              messages,
              0
            );
          const premadeMessages = await new TournamentPremadeMessage().create(
            this,
            populatedTournament,
            messages,
            participantMessages.length
          );
          const messageOptions: MessageOptions[] = [
            ...participantMessages,
            ...premadeMessages,
          ];

          const mainMessageContent = await new TournamentMainMessage().create(
            this,
            populatedTournament,
            [
              messages[0],
              ...(messages.length > participantMessages.length
                ? [messages[participantMessages.length]]
                : []),
            ]
          );

          promisesToWaitFor.push(mainMessage.edit(mainMessageContent[0]));
          promisesToWaitFor.push(mainMessage.suppressEmbeds(false));

          const mainChannel = mainMessage.channel as TextChannel;
          let newMessages: Message[] = await Promise.all(
            messageOptions.map(
              (option, i) =>
                new Promise<Message>(async (resolve, reject) => {
                  if (messages.length > i) {
                    const editedMessage = await messages[i]
                      .edit(option)
                      .catch((e) => {
                        console.error(e, "could not edit message");
                      });
                    if (editedMessage) {
                      resolve(editedMessage);
                    } else {
                      resolve(await mainChannel.send(option));
                    }
                  } else {
                    resolve(await mainChannel.send(option));
                  }
                })
            )
          );
          // let newMessages: Message[] = [];
          // for (const [i, option] of messageOptions.entries()) {
          //   if (messages.length > i) {
          //     const editedMessage = await messages[i]
          //       .edit(option)
          //       .catch((e) => {
          //         console.error(e, "could not edit message");
          //       });
          //     if (editedMessage) {
          //       newMessages.push(editedMessage);
          //     } else {
          //       newMessages.push(await mainChannel.send(option));
          //     }
          //   } else {
          //     newMessages.push(await mainChannel.send(option));
          //   }
          // }

          messages.push(
            ...newMessages.filter((m) => !messages.find((x) => x.id === m.id))
          );

          const threadMessageOptions = [];
          let newThreadMessages: Message[] = await Promise.all(
            threadMessageOptions.map(
              (option, i) =>
                new Promise<Message>(async (resolve, reject) => {
                  if (threadMessages.length > i) {
                    const editedMessage = await threadMessages[i]
                      .edit(option)
                      .catch((e) => {
                        console.error(e, "could not edit message");
                      });
                    if (editedMessage) {
                      resolve(editedMessage);
                    } else {
                      resolve(await thread.send(option));
                    }
                  } else {
                    resolve(await thread.send(option));
                  }
                })
            )
          );
          // let newThreadMessages: Message[] = [];
          // for (const [i, option] of threadMessageOptions.entries()) {
          //   if (threadMessages.length > i) {
          //     const editedMessage = await threadMessages[i]
          //       .edit(option)
          //       .catch((e) => {
          //         console.error(e, "could not edit message");
          //       });
          //     if (editedMessage) {
          //       newThreadMessages.push(editedMessage);
          //     } else {
          //       newThreadMessages.push(await thread.send(option));
          //     }
          //   } else {
          //     newThreadMessages.push(await thread.send(option));
          //   }
          // }

          threadMessages.push(
            ...newThreadMessages.filter(
              (m) => !threadMessages.find((x) => x.id === m.id)
            )
          );

          const unusedMessages = messages.filter(
            (m) => !newMessages.find((x) => x.id === m.id)
          );

          const unusedThreadMessages = threadMessages.filter(
            (m) => !newThreadMessages.find((x) => x.id === m.id)
          );

          this.threadMessages = newThreadMessages;
          this.messages = newMessages;

          unusedMessages
            .concat(unusedThreadMessages)
            .forEach((m) =>
              promisesToWaitFor.push(
                m
                  .delete()
                  .catch((e) =>
                    console.log("could not delete unused message", e.message)
                  )
              )
            );

          if (
            (
              (await this.guild.channels.fetch(
                populatedTournament.channelId
              )) as TextChannel
            )
              .permissionsFor(this.guild.client.user)
              .has("MANAGE_MESSAGES")
          ) {
            promisesToWaitFor.push(mainMessage.pin());
          }

          let shouldSaveDocument = false;
          if (
            this.parentManager.tournament.participants.length !==
            populatedTournament.participants.length
          ) {
            shouldSaveDocument = true;
          }
          if (
            !populatedTournament.threadMessageIds ||
            populatedTournament.threadMessageIds.length !==
              threadMessages.length ||
            !populatedTournament.threadMessageIds.every((id) =>
              threadMessages.find((m) => m.id === id)
            )
          ) {
            populatedTournament.threadMessageIds = threadMessages.map(
              (m) => m.id
            );
            shouldSaveDocument = true;
          }

          if (
            !populatedTournament.messageIds ||
            populatedTournament.messageIds.length !== messages.length ||
            !populatedTournament.messageIds.every((id) =>
              messages.find((m) => m.id === id)
            )
          ) {
            populatedTournament.messageIds = messages.map((m) => m.id);
            shouldSaveDocument = true;
          }
          if (shouldSaveDocument) {
            promisesToWaitFor.push(populatedTournament.ownerDocument().save());
            this.parentManager.tournament = populatedTournament;
          }
          await Promise.allSettled(promisesToWaitFor).catch((e) =>
            console.log("could not wait for all promises")
          );
        } catch (e) {
          console.error(e);
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
      const messages = await this.getMessages();
      await Promise.allSettled(
        threadMessages.map((m) => m.edit({ components: [] }))
      );
      thread
        .setArchived(true)
        .catch((e) => console.error("could not delete thread"));
      mainMessage.delete();
      this.mainMessage = null;
      messages.forEach((m) => m.delete());
      return [mainMessage, ...messages, ...threadMessages];
    } catch (e) {
      return undefined;
    }
  }
}

class Queue {
  running: () => void;
  autorun: boolean;
  queue: (() => void)[];
  max: number;

  constructor(autorun = true, queue: (() => Promise<any>)[] = [], max = 1) {
    this.running = undefined;
    this.autorun = autorun;
    this.queue = queue;
    this.max = max;
  }

  add(cb: () => Promise<any>) {
    if (this.queue.length <= this.max) {
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
