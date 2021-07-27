import {
  Client,
  DMChannel,
  Interaction,
  Message,
  MessageActionRow,
  MessageActionRowComponent,
  MessageButton,
  MessageComponentInteraction,
  MessageOptions,
  MessageSelectMenu,
  WebhookMessageOptions,
} from "discord.js";
import DatabaseManager from "../db/DatabaseManager";
import IUser, { IValoAccountInfo } from "../db/interfaces/IUser";
import Conversation, {
  ConversationAction,
  QuestionInteractionType,
} from "../Conversation";
import ValorantApi, {
  LinkUserResponseTypes,
  RefreshUserResponseTypes,
} from "../api/ValorantApi";
import { v1 as uuidv1 } from "uuid";

const dbManager = DatabaseManager.getInstance();
const api = ValorantApi.getInstatnce();

export default class MessageHandler {
  bot: Client;
  constructor(bot: Client) {
    this.bot = bot;
  }
  start(): void {
    this.bot.on("messageCreate", (msg) => this.handle(msg));
  }

  private async handle(msg: Message) {
    if (msg.author.bot) return;

    if (msg.channel.type === "GUILD_TEXT") this.handleGuildMessage(msg);
    else if (msg.channel.type === "DM") this.handleDm(msg);
  }

  private async handleDm(msg: Message) {
    const dbUser = await dbManager.getUser({ discordId: msg.author.id });

    if (Conversation.activeConversations.has(msg.author.id)) return;
    switch (msg.content) {
      case "link":
        {
          const conversation = await Conversation.createLinkConversation(
            msg.channel as DMChannel,
            msg.author
          );
          conversation.start();
        }
        break;
      case "refresh":
        {
          const conversation = await Conversation.createRefreshConversation(
            msg.channel as DMChannel,
            msg.author
          );
          conversation?.sendNextCallToAction();
        }
        break;
      default: {
        msg.channel.send(Conversation.helpMessage);
      }
    }
  }

  private async handleGuildMessage(msg: Message) {}
}
