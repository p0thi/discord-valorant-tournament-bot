import {
  AwaitMessagesOptions,
  ButtonInteraction,
  Message,
  MessageActionRow,
  MessageButton,
  MessageEmbed,
  MessageOptions,
  MessagePayload,
  MessageSelectMenu,
  SelectMenuInteraction,
  WebhookMessageOptions,
} from "discord.js";
import {
  InteractionResponseTypes,
  MessageComponentTypes,
} from "discord.js/typings/enums";

import log from "./util/log";

const activeConversations = {};

export default class Conversation {
  triggerMessage: Message;
  actionStack: ConversationAction[];
  ttl: number;
  onSuccess: (Conversation) => void;
  onError: (Conversation) => void;

  private lastInteraction: Date;
  private timeout: NodeJS.Timeout;
  private confirmed: boolean = false;

  constructor() {}

  static createConversation(
    msg: Message,
    onSucc: (Conversation) => void,
    onErr: (Conversation) => void,
    ttl = 600000
  ): Conversation {
    if (activeConversations[msg.author.id]) {
      onErr(this);
      return undefined;
    }
    if (msg.channel.type !== "DM") {
      onErr(this);
      return undefined;
    }

    const conv = new Conversation();

    activeConversations[msg.author.id] = conv;

    conv.triggerMessage = msg;
    conv.onSuccess = onSucc;
    conv.onError = onErr;
    conv.ttl = ttl;

    conv.lastInteraction = new Date();
    conv.timeout = setTimeout(() => {
      msg.reply("The conversation timed out and has been reset. :alarm_clock:");
      conv.abort();
      onErr(this);
    }, conv.ttl);
    return conv;
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
            .setDescription("Please confirm the inputs you made:")
            .addField("\u200b", "\u200b");

          for (let i = 0; i < this.actionStack.length - 1; i++) {
            const item = this.actionStack[i];
            console.log(item.title, item.result);
            finalEmbed.addField(item.title, item.result, true);
          }

          let row = new MessageActionRow().addComponents([
            new MessageButton()
              .setCustomId("conversation-confirm")
              .setLabel("Confirm")
              .setStyle("PRIMARY"),
            new MessageButton()
              .setCustomId("conversation-deny")
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
        (resultToHandle) => {
          if (resultToHandle.toLowerCase() === "cancel") {
            this.abort();
            this.onError(this);
          }
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

  finish(): void {
    this.delete();
    this.onSuccess(this);
  }

  public abort(): void {
    clearTimeout(this.timeout);
    if (this.actionStack) {
      for (var action of this.actionStack) {
        if (action.revert) {
          action.revert();
        }
      }
    }
    this.delete();
  }

  delete(): void {
    activeConversations[this.triggerMessage.author.id] = undefined;
    clearTimeout(this.timeout);
  }

  async sendNextCallToAction(): Promise<void> {
    let action = this.getNextActionWithoutResult();
    console.log("action", !!action);
    if (!action) {
      this.finish();
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
}

export class ConversationAction {
  title: string;
  conv: Conversation;
  message: () => WebhookMessageOptions;
  revert?: () => void;
  verifyResponse: (string) => boolean;
  onResultReceived?: (string) => void;
  result: string = undefined;
  interactionType: QuestionInteractionType;

  constructor(
    title: string,
    conv: Conversation,
    interactionType: QuestionInteractionType,
    message: () => WebhookMessageOptions,
    verifyResponse: (string: any) => boolean,
    onResultReceived?: (string) => void,
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
    const questionContent = this.message();

    console.log(this.title);
    console.log("sendMessage", this.conv.triggerMessage.id);
    const question = await this.conv.triggerMessage.channel.send(
      questionContent
    );

    const actionResponse = new ActionResponse(
      this.interactionType,
      question,
      this.verifyResponse
    );
    const returnVal = await actionResponse.getResponse();

    if (!returnVal) {
      this.conv.triggerMessage.channel.send(
        "I could not handle this input. Please try again"
      );

      question.delete();
      return await this.sendMessage();
    }

    this.result = returnVal;
    if (this.onResultReceived) {
      this.onResultReceived(returnVal);
    }
    this.conv.actionResultChanged();
  }
}

class ActionResponse {
  type: QuestionInteractionType;
  question: Message;
  verifyResponse: (string) => boolean;

  constructor(
    type: QuestionInteractionType,
    question: Message,
    verifyResponse: (string) => boolean
  ) {
    this.type = type;
    this.question = question;
    this.verifyResponse = verifyResponse;
  }

  async getResponse(): Promise<string> {
    if (this.type === QuestionInteractionType.MESSAGE) {
      const messages = await this.question.channel.awaitMessages({
        max: 1,
        time: 600000,
      } as AwaitMessagesOptions);

      const content = messages.first().content;

      if (this.verifyResponse(content)) {
        return content;
      }
      return undefined;
    } else if (this.type === QuestionInteractionType.BUTTON) {
      const interaction = await this.question.awaitMessageComponent({
        componentType: "BUTTON",
        time: 600000,
      });
      const content = (interaction.component as MessageButton).label;
      interaction.deferUpdate();
      if (this.verifyResponse(content)) {
        return content;
      }
      return undefined;
    } else if (this.type === QuestionInteractionType.SELECT) {
      const interaction = await this.question.awaitMessageComponent({
        componentType: "SELECT_MENU",
        time: 600000,
      });
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
