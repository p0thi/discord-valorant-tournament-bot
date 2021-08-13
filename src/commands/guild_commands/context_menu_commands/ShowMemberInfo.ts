import {
  Guild,
  CommandInteraction,
  ContextMenuInteraction,
  GuildMember,
  MessageOptions,
  MessageEmbed,
  InteractionReplyOptions,
} from "discord.js";
import ValorantApi, {
  LinkUserResponseTypes,
  RefreshUserResponseTypes,
} from "../../../api/ValorantApi";
import DatabaseManager, { regions } from "../../../db/DatabaseManager";
import { IValoAccountInfo } from "../../../db/interfaces/IUser";
import emojis from "../../../util/emojis";
import CustomApplicationCommand, {
  CommandPermissionRole,
} from "../../CustomApplicationCommand";
import { SlashCommandTemplate } from "../../SlashCommandCreator";
import AObservableCommand from "../AObservableCommand";
import { IGuildContextMenuCommand } from "../IGuildCommand";

const api = ValorantApi.getInstatnce();

export default class ShowMemberInfo
  extends AObservableCommand
  implements IGuildContextMenuCommand
{
  private static _tournamentCommands: Map<Guild, ShowMemberInfo> = new Map();
  guild: Guild;
  private constructor(guild: Guild) {
    super();
    this.guild = guild;
  }
  public static getInstance(guild: Guild): ShowMemberInfo {
    if (ShowMemberInfo._tournamentCommands.has(guild)) {
      return ShowMemberInfo._tournamentCommands.get(guild);
    }
    const instance = new ShowMemberInfo(guild);
    ShowMemberInfo._tournamentCommands.set(guild, instance);
    return instance;
  }

  notifyObservers() {
    this.observers.forEach((observer) => observer.commandChangeObserved(this));
  }

  async generateTemplate(): Promise<SlashCommandTemplate> {
    const role = CommandPermissionRole.MOD;
    return {
      name: "Show Valo Info",
      forOwner: false,
      defaultPermission: false,
      role,
      create: (): CustomApplicationCommand => {
        return {
          name: "Show Valo Info",
          type: "USER",
          defaultPermission: false,
          handler: async (interaction: ContextMenuInteraction) => {
            interaction.deferReply({ ephemeral: true });
            const member: GuildMember = interaction.options.getMember(
              "user"
            ) as GuildMember;

            if (!member) {
              interaction.followUp({
                content: "Error: No user found.",
                ephemeral: true,
              });
              return;
            }
            const dbUser = await DatabaseManager.getInstance().getUser({
              discordId: member.id,
            });

            const resultMessageOption: InteractionReplyOptions = {
              components: [],
              embeds: [],
              ephemeral: true,
            };
            for (const region of regions) {
              const currentValoAccount: IValoAccountInfo =
                dbUser[`${region}_account`];

              if (currentValoAccount) {
                resultMessageOption.embeds.push(
                  new MessageEmbed({
                    title: `${region.toUpperCase()} Account`,
                    fields: [
                      {
                        name: "Account name",
                        value: `**${currentValoAccount.name}#${currentValoAccount.tag}**`,
                        inline: true,
                      },
                      {
                        name: "Elo",
                        value: `\`${currentValoAccount.elo}\``,
                        inline: true,
                      },
                      {
                        name: "Rank",
                        value:
                          currentValoAccount.currenttier === 0 ||
                          currentValoAccount.elo === 0
                            ? "No Rank"
                            : `<:${
                                emojis
                                  .find(
                                    (e) =>
                                      e.tier === currentValoAccount.currenttier
                                  )
                                  .getValoEmoji(this.guild.client).identifier
                              }> ${currentValoAccount.currenttierpatched}`,
                        inline: true,
                      },
                    ],
                  })
                );
              }
            }
            resultMessageOption.content =
              `Valorant accounts of <@${member.id}>` +
              (resultMessageOption.embeds.length === 0
                ? "\n\nNo accounts linked"
                : "");
            interaction.followUp(resultMessageOption);
          },
        } as CustomApplicationCommand;
      },
    } as SlashCommandTemplate;
  }
}
