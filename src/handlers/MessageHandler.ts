import {
  Client,
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
import IUser from "../db/interfaces/IUser";
import Conversation, {
  ConversationAction,
  QuestionInteractionType,
} from "../Conversation";

const dbManager = DatabaseManager.getInstance();

export default class MessageHandler {
  bot: Client;
  constructor(bot: Client) {
    this.bot = bot;
  }
  start(): void {
    // this.bot.on("messageCreate", (msg) => this.handle(msg));
  }

  private async handle(msg: Message) {
    if (msg.author.bot) return;

    const dbUser = await dbManager.getUser({ discordId: msg.author.id });

    if (msg.channel.type === "GUILD_TEXT") this.handleGuildMessage(msg, dbUser);
    else if (msg.channel.type === "DM") this.handleDm(msg, dbUser);
  }

  private async handleDm(msg: Message, dbUser: IUser) {
    const conv = Conversation.createConversation(
      msg,
      (conv) => {
        console.log(conv.actionStack.map((a) => a.result).join(", "));
      },
      (conv) => {}
    );
    conv?.setActions([
      new ConversationAction(
        "First",
        conv,
        QuestionInteractionType.BUTTON,
        () => {
          let row = new MessageActionRow().addComponents([
            new MessageButton()
              .setCustomId("conversation-confirm")
              .setLabel("Yes")
              .setStyle("PRIMARY"),
            new MessageButton()
              .setCustomId("conversation-deny")
              .setLabel("No")
              .setStyle("DANGER"),
          ]);
          return {
            content: "Baum",
            components: [row],
          } as WebhookMessageOptions;
        },
        (content) => {
          return content === "Yes" || content === "No";
        }
      ),
      new ConversationAction(
        "Second",
        conv,
        QuestionInteractionType.MESSAGE,
        () => {
          return {
            content: "Blume",
          } as WebhookMessageOptions;
        },
        (content) => {
          return content === "Yes" || content === "No";
        }
      ),
      new ConversationAction(
        "Third",
        conv,
        QuestionInteractionType.BUTTON,
        () => {
          let row = new MessageActionRow().addComponents([
            new MessageButton()
              .setCustomId("conversation-confirm")
              .setLabel("Yes")
              .setStyle("PRIMARY"),
            new MessageButton()
              .setCustomId("conversation-deny")
              .setLabel("No")
              .setStyle("DANGER"),
          ]);
          return {
            content: "Strauch",
            components: [row],
          } as WebhookMessageOptions;
        },
        (content) => {
          return content === "Yes" || content === "No";
        }
      ),
    ]);
    conv?.sendNextCallToAction();
  }

  private async handleGuildMessage(msg: Message, databaseUser: IUser) {
    let row = new MessageActionRow().addComponents([
      new MessageButton()
        .setCustomId("conversation-confirm")
        .setLabel("Yes")
        .setStyle("PRIMARY"),
      new MessageButton()
        .setCustomId("conversation-deny")
        .setLabel("No")
        .setStyle("DANGER"),
    ]);

    let sent = msg.channel.send({
      content: "Test",
      components: [row],
    } as MessageOptions);
    (await sent)
      .awaitMessageComponent({
        componentType: "BUTTON",
        time: 5000,
      })
      .then((interaction: MessageComponentInteraction) => {
        interaction.reply({ ephemeral: true, content: "Test" });
        // msg.channel.send((interaction.component as MessageButton).label);
      })
      .catch((err) => {});
  }
}
