import {
  Guild,
  ContextMenuInteraction,
  GuildMember,
  MessageEmbed,
  InteractionReplyOptions,
  MessageActionRow,
  MessageSelectMenu,
  SelectMenuInteraction,
} from "discord.js";
import ValorantApi, {
  IApiAccountInfo,
  RefreshUserResponseTypes,
} from "../../../api/ValorantApi";
import DatabaseManager, { regions } from "../../../db/DatabaseManager";
import { ITournamentSetting } from "../../../db/interfaces/IGuild";
import { IValoAccountInfo } from "../../../db/interfaces/IUser";
import emojis from "../../../util/emojis";
import CustomApplicationCommand, {
  CommandPermissionRole,
} from "../../CustomApplicationCommand";
import { SlashCommandTemplate } from "../../SlashCommandCreator";
import AObservableCommand from "../AObservableCommand";
import { IGuildContextMenuCommand } from "../IGuildCommand";
import { v1 as uuidv1 } from "uuid";
import TournamentManager from "../../../managers/TournamentManager";

const api = ValorantApi.getInstatnce();

export default class RefreshValoInfo
  extends AObservableCommand
  implements IGuildContextMenuCommand
{
  private static _tournamentCommands: Map<Guild, RefreshValoInfo> = new Map();
  guild: Guild;
  private constructor(guild: Guild) {
    super();
    this.guild = guild;
  }
  public static getInstance(guild: Guild): RefreshValoInfo {
    if (RefreshValoInfo._tournamentCommands.has(guild)) {
      return RefreshValoInfo._tournamentCommands.get(guild);
    }
    const instance = new RefreshValoInfo(guild);
    RefreshValoInfo._tournamentCommands.set(guild, instance);
    return instance;
  }

  notifyObservers() {
    this.observers.forEach((observer) => observer.commandChangeObserved(this));
  }

  async generateTemplate(): Promise<SlashCommandTemplate> {
    const role = CommandPermissionRole.MOD;
    const dbManager = DatabaseManager.getInstance();
    // const templateDbGuild = await dbManager.getGuild({
    //   discordId: this.guild.id,
    // });
    return {
      name: "Refresh Valo Accounts",
      forOwner: false,
      defaultPermission: false,
      role,
      create: (): CustomApplicationCommand => {
        return {
          name: "Refresh Valo Accounts",
          type: "USER",
          defaultPermission: false,
          handler: async (interaction: ContextMenuInteraction) => {
            interaction.deferReply({ ephemeral: true });
            const member: GuildMember = interaction.options.getMember(
              "user"
            ) as GuildMember;

            const dbUser = await dbManager.getUser({ discordId: member.id });
            const refreshingPromises: Promise<
              [RefreshUserResponseTypes, IApiAccountInfo]
            >[] = [];
            for (const region of regions) {
              if (dbUser[`${region}_account`]) {
                refreshingPromises.push(
                  api.refreshUser(dbUser, region, this.guild.client)
                );
              }
            }

            await Promise.allSettled(refreshingPromises);
            interaction.followUp({
              content: `${refreshingPromises.length} accounts refreshed`,
              ephemeral: true,
            });
          },
        } as CustomApplicationCommand;
      },
    } as SlashCommandTemplate;
  }
}
