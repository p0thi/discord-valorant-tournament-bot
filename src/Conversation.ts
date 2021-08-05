import {
  AwaitMessagesOptions,
  ButtonInteraction,
  DMChannel,
  EmbedField,
  InteractionCollector,
  Message,
  MessageActionRow,
  MessageActionRowComponent,
  MessageButton,
  MessageComponentInteraction,
  MessageEmbed,
  MessageOptions,
  MessagePayload,
  MessageSelectMenu,
  SelectMenuInteraction,
  TextChannel,
  User,
  WebhookMessageOptions,
} from "discord.js";
import {
  InteractionResponseTypes,
  MessageComponentTypes,
} from "discord.js/typings/enums";
import ValorantApi, {
  LinkUserResponseTypes,
  RefreshUserResponseTypes,
} from "./api/ValorantApi";
import DatabaseManager from "./db/DatabaseManager";
import { v1 as uuidv1 } from "uuid";

import log from "./util/log";
import { IValoAccountInfo } from "./db/interfaces/IUser";

const api = ValorantApi.getInstatnce();
const dbManager = DatabaseManager.getInstance();

export default class Conversation {
  static activeConversations: Map<string, Conversation> = new Map();
  static helpMessage = {
    embeds: [
      {
        title: "This is how I can help you:",
        description:
          "Just write one of the words below, or select the action from the drop down menu to start a conversation with me.\nI will then lead you through the process... :blush:\n\u200b",
        fields: [
          {
            name: "link",
            value: "Lets you link a valorant account to your discord account.",
          },
          {
            name: "refresh",
            value:
              "Refreshes your valorant account information (e.g. rank, elo, ...) for a selectable server region.",
          },
          {
            name: "\u200b",
            value:
              "**:exclamation: You can ignore this message, if you don't want to do anything. :exclamation:**",
          },
        ],
      },
    ],
    components: [
      new MessageActionRow().addComponents([
        new MessageSelectMenu()
          .setCustomId("dm-help-selector")
          .setPlaceholder("Select the task you want to solve")
          .setMaxValues(1)
          .addOptions([
            {
              label: "Link",
              description: "Link your valorant account to your discord account",
              value: "link",
            },
            {
              label: "Refresh",
              description: "Refresh valorant account info",
              value: "refresh",
            },
          ]),
      ]),
    ],
  } as MessageOptions;
  author: User;
  channel: DMChannel;
  actionStack: ConversationAction[];
  ttl: number;
  onSuccess: (Conversation: Conversation) => Promise<boolean>;
  onError: (Conversation: Conversation) => Promise<void>;
  sentMessages: Message[] = [];

  private buttonCollector: InteractionCollector<MessageComponentInteraction>;
  private lastInteraction: Date;
  private timeout: NodeJS.Timeout;
  private confirmed: boolean = false;
  private _deleted = false;
  public get deleted() {
    return this._deleted;
  }

  private messageComponentInteractions: MessageComponentInteraction[] = [];

  constructor() {}

  static createConversation(
    channel: DMChannel,
    author: User,
    onSucc: (Conversation: Conversation) => Promise<boolean>,
    onErr: (Conversation: Conversation) => Promise<void>,
    ttl = 600000
  ): Conversation {
    if (Conversation.activeConversations.has(author.id)) {
      const conversation = Conversation.activeConversations.get(author.id);
      onErr(conversation);
      return undefined;
    }
    if (channel.type !== "DM") {
      onErr(undefined);
      return undefined;
    }

    const conv = new Conversation();

    Conversation.activeConversations.set(author.id, conv);

    conv.channel = channel;
    conv.author = author;
    conv.onSuccess = onSucc;
    conv.onError = onErr;
    conv.ttl = ttl;
    conv.buttonCollector = channel.createMessageComponentCollector({
      filter: (i) => i.customId === "conversation-abort",
      max: 1,
    });
    conv.buttonCollector.on("collect", (component) => {
      if (component.customId === "conversation-abort") {
        component.deferUpdate();
        conv.abort();
      }
    });

    conv.lastInteraction = new Date();
    conv.timeout = setTimeout(() => {
      channel.send(
        "The conversation timed out and has been reset. :alarm_clock:"
      );
      conv.abort();
      onErr(conv);
    }, conv.ttl);
    return conv;
  }

  addMessageComponentInteraction(interaction: MessageComponentInteraction) {
    this.messageComponentInteractions.push(interaction);
  }

  setActions(actions: ConversationAction[]): Conversation {
    this.actionStack = actions;
    this.actionStack.push(
      new ConversationAction(
        "Confirm",
        this,
        QuestionInteractionType.BUTTON,
        () => {
          let finalEmbed = new MessageEmbed()
            .setTitle("Summary")
            .setDescription("Please confirm the inputs you made:\n\u200b");

          for (let i = 0; i < this.actionStack.length - 1; i++) {
            const item = this.actionStack[i];
            finalEmbed.addField(item.title, item.result, true);
          }

          let row = new MessageActionRow().addComponents([
            new MessageButton()
              .setCustomId("conversation-confirm")
              .setLabel("Confirm")
              .setStyle("PRIMARY"),
            new MessageButton()
              .setCustomId("conversation-cancel")
              .setLabel("Cancel")
              .setStyle("DANGER"),
          ]);

          return {
            embeds: [finalEmbed],
            components: [row],
          } as MessageOptions;
        },
        (strToVerify) =>
          strToVerify.toLowerCase() === "confirm" ||
          strToVerify.toLowerCase() === "cancel",
        async (resultToHandle) => {
          if (resultToHandle.toLowerCase() === "cancel") {
            this.abort();
            this.onError(this);
          }
          return true;
        }
      )
    );
    return this;
  }

  getNextActionWithoutResult(): ConversationAction {
    for (let item of this.actionStack) {
      if (item.result === undefined) {
        return item;
      }
    }
    return undefined;
  }

  async finish(): Promise<void> {
    this.delete();
    await this.onSuccess(this);
    await this.channel.send("Interaction complete :white_check_mark:");
    this.channel.send(Conversation.helpMessage);
  }

  public abort(): void {
    if (this._deleted) return;
    clearTimeout(this.timeout);
    if (this.actionStack) {
      for (var action of this.actionStack) {
        if (action.revert) {
          action.revert();
        }
      }
    }

    this.delete();
    this.sentMessages.forEach((msg) => {
      msg.edit({ components: [] }).catch(() => {
        console.log("could not remove components from dm message");
      });
    });
    this.channel
      .send(
        "The current interaction **has been aborted**. Please start a new one. :octagonal_sign:"
      )
      .then(() => {
        this.channel.send(Conversation.helpMessage);
      });
  }

  delete(): void {
    Conversation.activeConversations.delete(this.author.id);
    clearTimeout(this.timeout);
    this.buttonCollector.stop();
    this._deleted = true;
  }

  start(): void {
    this.sendNextCallToAction();
  }

  async sendNextCallToAction(): Promise<void> {
    let action = this.getNextActionWithoutResult();
    if (!action) {
      if (!this._deleted) this.finish();

      return;
    }
    action.sendMessage();
  }

  actionResultChanged() {
    this.timeout.refresh();
    this.sendNextCallToAction();
  }

  checkDateValid(): boolean {
    let valid =
      new Date().getTime() - this.lastInteraction.getTime() <= this.ttl;
    if (!valid) {
      this.abort();
      this.onError(this);
    }
    return valid;
  }

  static async createLinkConversation(
    channel: DMChannel,
    author: User
  ): Promise<Conversation> {
    const dbUser = await dbManager.getUser({ discordId: author.id });
    const conversation = Conversation.createConversation(
      channel,
      author,
      (conv: Conversation) => {
        return new Promise<boolean>(async (resolve, reject) => {
          const [username, tag] = conv.actionStack[0].result.split("#");
          const user = await api.getUser(username, tag);
          const linkResult = await api.linkUser(user, dbUser);

          switch (linkResult[0]) {
            case LinkUserResponseTypes.ALREADY_LINKED:
              conv.channel.send({
                content: `You already have linked this account: **${user.name}#${user.tag}**\nInteraction has been aborted. Please start a new one.`,
              });
              resolve(false);
              break;
            case LinkUserResponseTypes.DIFFERENT_ACCOUNT_LINKED:
              const overwriteId = uuidv1();
              const abortId = uuidv1();

              let valoAccountInfo = dbUser[
                `${user.region}_account`
              ] as IValoAccountInfo;

              if (!valoAccountInfo) {
                valoAccountInfo = {} as IValoAccountInfo;
                dbUser[`${user.region}_account`] = valoAccountInfo;
                await dbUser.save();
                valoAccountInfo = dbUser[
                  `${user.region}_account`
                ] as IValoAccountInfo;
              }

              console.log(overwriteId);

              let row = new MessageActionRow().addComponents([
                new MessageButton()
                  .setCustomId(overwriteId)
                  .setLabel("Overwrite")
                  .setStyle("PRIMARY"),
                new MessageButton()
                  .setCustomId(abortId)
                  .setLabel("Abort")
                  .setStyle("DANGER"),
              ]);

              console.log("sending reply");
              conv.sentMessages.push(
                await conv.channel.send({
                  content: `You already have a Valorant account in **${user.region.toUpperCase()}** linked (${
                    valoAccountInfo.name
                  }#${valoAccountInfo.tag}). Do you want to replace it?`,
                  components: [row],
                })
              );

              conv.channel
                .createMessageComponentCollector({
                  componentType: "BUTTON",
                  time: 600000,
                  filter: (i) => {
                    const customId = i.customId;
                    return customId === overwriteId || customId === abortId;
                  },
                  max: 1,
                })
                .on("collect", async (collected) => {
                  console.log("Button Interaction");

                  const content = collected.customId;

                  if (content === overwriteId) {
                    console.log("overwrite");
                    await api.linkUser(user, dbUser, true);
                    collected.reply({
                      content: `Successfully overwrote your account with **${user.name}#${user.tag}**.`,
                    });
                    resolve(true);
                  } else if (content === abortId) {
                    console.log("abort");
                    collected.deferUpdate();
                    resolve(false);
                  }
                });
              break;
            case LinkUserResponseTypes.NOT_FOUND:
              conv.channel.send({
                content: `Could not find a Valorant account with the name **${username}#${tag}**\nInteraction has been aborted. Please start a new one.`,
              });
              resolve(false);
              break;
            case LinkUserResponseTypes.OK:
              conv.channel.send({
                content: `Linked **${user.name}#${user.tag}** (Level ${
                  user.account_level
                }) to your discord account for the server reqion **${user.region.toUpperCase()}**.`,
              });
              resolve(true);
              break;
          }
        });
      },
      (conv) => {
        return undefined;
      }
    );
    conversation.setActions([
      new ConversationAction(
        "Valo Name",
        conversation,
        QuestionInteractionType.MESSAGE,
        () => ({
          content:
            "Please write me your valorant username plus tag (e.g. **Name#1234**)",
        }),
        (toVerify) => {
          const usernameRegex = /.+#.+/g;
          const match = toVerify.match(usernameRegex);
          return !!match;
        },
        async (result, conv) => {
          return true;
        }
      ),
    ]);
    return conversation;
  }

  static async createRefreshConversation(
    channel: DMChannel,
    author: User
  ): Promise<Conversation> {
    const dbUser = await dbManager.getUser({ discordId: author.id });
    const conversation = Conversation.createConversation(
      channel as DMChannel,
      author,
      async (conv) => {
        const result = await api.refreshUser(
          dbUser,
          conv.actionStack[0].result
        );

        console.log(result);
        if (result[0] === RefreshUserResponseTypes.OK) {
          conv.channel.send({
            content: `Successfully refreshed your account **${result[1].name}#${result[1].tag}**`,
          });
        } else if (result[0] === RefreshUserResponseTypes.NOT_LINKED) {
          conv.channel.send({
            content: `:x: You have not linked a valorant account for that region yet. :x:`,
          });
        } else {
          conv.channel.send({
            content: `Could not get your elo data.\nMaybe you did not play a competetive match in a long time?`,
          });
        }
        return true;
      },
      (conv) => {
        return undefined;
      }
    );
    conversation.setActions([
      new ConversationAction(
        "Region",
        conversation,
        QuestionInteractionType.SELECT,
        () => {
          return {
            content: "Please select a region",
            components: [
              new MessageActionRow().addComponents([
                new MessageSelectMenu()
                  .setCustomId("region-select-menu")
                  .setPlaceholder("Select the region of your valorant server")
                  .addOptions([
                    { label: "EU", value: "eu" },
                    { label: "NA", value: "na" },
                    { label: "AP", value: "ap" },
                    { label: "KR", value: "kr" },
                  ]),
              ]),
            ],
          };
        },
        (toverify) => {
          return (
            toverify === "eu" ||
            toverify === "na" ||
            toverify === "ap" ||
            toverify === "kr"
          );
        }
      ),
    ]);
    return conversation;
  }
}

export class ConversationAction {
  title: string;
  conv: Conversation;
  message: () => MessageOptions;
  revert?: () => void;
  verifyResponse: (string) => boolean;
  onResultReceived?: (result: string, conv: Conversation) => Promise<boolean>;
  result: string = undefined;
  interactionType: QuestionInteractionType;

  constructor(
    title: string,
    conv: Conversation,
    interactionType: QuestionInteractionType,
    message: () => MessageOptions,
    verifyResponse: (string: string) => boolean,
    onResultReceived?: (result: string, conv: Conversation) => Promise<boolean>,
    revert = () => {}
  ) {
    this.title = title;
    this.conv = conv;
    this.message = message;
    this.revert = revert;
    this.interactionType = interactionType;
    this.onResultReceived = onResultReceived;
    this.verifyResponse = verifyResponse;
  }

  async sendMessage(): Promise<void> {
    const content: MessageOptions = this.message();
    if (this.conv.deleted) {
      return;
    }

    if (!content.components) {
      content.components = [];
    }
    let componentRow: MessageActionRow;

    const cancelPresent = content.components.find(
      (row) =>
        !!(row.components as MessageActionRowComponent[]).find(
          (c) => c.customId === "conversation-cancel"
        )
    );
    if (!cancelPresent) {
      for (const comp of content.components) {
        if (
          comp.components &&
          comp.components.length > 0 &&
          comp.components[0].type === "BUTTON"
        ) {
          componentRow = comp as MessageActionRow;
        }
      }
      const abortConversationRow = (
        componentRow || new MessageActionRow()
      ).addComponents([
        new MessageButton()
          .setCustomId("conversation-abort")
          .setLabel("Abort")
          .setStyle("SECONDARY"),
      ]);

      if (!componentRow) {
        content.components.push(abortConversationRow);
      }
    }

    const question = await this.conv.channel.send(content);
    this.conv.sentMessages.push(question);

    const actionResponse = new ActionResponse(
      this.interactionType,
      question,
      this.conv,
      this.verifyResponse
    );
    const returnVal = await actionResponse.getResponse();

    if (this.conv.deleted) {
      return;
    }

    if (!returnVal) {
      this.conv.channel.send("I could not handle this input. Please try again");

      question.delete();
      return await this.sendMessage();
    }

    this.result = returnVal;
    if (this.onResultReceived) {
      if (!(await this.onResultReceived(returnVal, this.conv))) {
        this.conv.abort();
        return;
      }
    }
    this.conv.actionResultChanged();
  }
}

class ActionResponse {
  type: QuestionInteractionType;
  question: Message;
  conv: Conversation;
  verifyResponse: (string) => boolean;

  constructor(
    type: QuestionInteractionType,
    question: Message,
    conv: Conversation,
    verifyResponse: (string) => boolean
  ) {
    this.type = type;
    this.question = question;
    this.conv = conv;
    this.verifyResponse = verifyResponse;
  }

  async getResponse(): Promise<string> {
    if (this.type === QuestionInteractionType.MESSAGE) {
      const messages = await this.question.channel.awaitMessages({
        filter: (m) =>
          m.author.id !== this.question.author.id && !this.conv.deleted,
        max: 1,
        time: 700000,
      } as AwaitMessagesOptions);

      if (!messages || messages.size === 0) {
        this.conv.abort();
        return;
      }
      this.conv.channel.sendTyping();

      const content = messages.first().content;

      if (this.verifyResponse(content)) {
        return content;
      }
      return undefined;
    } else if (this.type === QuestionInteractionType.BUTTON) {
      const interaction = await this.question.awaitMessageComponent({
        componentType: "BUTTON",
        time: 700000,
      });

      if (!interaction) {
        this.conv.abort();
        return;
      }

      this.conv.addMessageComponentInteraction(interaction);

      const content = (interaction.component as MessageButton).label;
      interaction.deferUpdate();
      if (this.verifyResponse(content)) {
        return content;
      }
      return undefined;
    } else if (this.type === QuestionInteractionType.SELECT) {
      const interaction = await this.question.awaitMessageComponent({
        componentType: "SELECT_MENU",
        time: 700000,
      });

      if (!interaction) {
        this.conv.abort();
        return;
      }

      this.conv.addMessageComponentInteraction(interaction);

      const content = (interaction as SelectMenuInteraction).values[0];
      interaction.deferUpdate();
      if (this.verifyResponse(content)) {
        return content;
      }
      return undefined;
    }
  }
}

export enum QuestionInteractionType {
  MESSAGE,
  BUTTON,
  SELECT,
}
