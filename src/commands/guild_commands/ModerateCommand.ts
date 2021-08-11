import { CommandInteraction, Guild } from "discord.js";
import ValorantApi, {
  LinkUserResponseTypes,
  RefreshUserResponseTypes,
} from "../../api/ValorantApi";
import DatabaseManager from "../../db/DatabaseManager";
import emojis from "../../util/emojis";
import CustomApplicationCommand, {
  CommandPermissionRole,
} from "../CustomApplicationCommand";
import { SlashCommandTemplate } from "../SlashCommandCreator";
import AObservableCommand from "./AObservableCommand";
import IGuildCommand from "./IGuildCommand";

const dbManager = DatabaseManager.getInstance();
const api = ValorantApi.getInstatnce();

export default class ModerateCommand
  extends AObservableCommand
  implements IGuildCommand
{
  private static _tournamentCommands: Map<Guild, ModerateCommand> = new Map();
  guild: Guild;
  private constructor(guild: Guild) {
    super();
    this.guild = guild;
  }
  public static getInstance(guild: Guild): ModerateCommand {
    if (ModerateCommand._tournamentCommands.has(guild)) {
      return ModerateCommand._tournamentCommands.get(guild);
    }
    const instance = new ModerateCommand(guild);
    ModerateCommand._tournamentCommands.set(guild, instance);
    return instance;
  }

  notifyObservers() {
    this.observers.forEach((observer) => observer.commandChangeObserved(this));
  }

  async generateTemplate(): Promise<SlashCommandTemplate> {
    const role = CommandPermissionRole.MOD;
    const templateDbGuild = await dbManager.getGuild({
      discordId: this.guild.id,
    });
    return {
      name: "moderate",
      forOwner: false,
      defaultPermission: false,
      role,
      create: (): CustomApplicationCommand => {
        return {
          name: "moderate",
          description: "Moderate the bot",
          defaultPermission: false,
          options: [
            {
              name: "user",
              description: "Moderate users",
              type: "SUB_COMMAND_GROUP",
              options: [
                {
                  name: "link",
                  description: "Link a users valorant account",
                  type: "SUB_COMMAND",
                  options: [
                    {
                      name: "user",
                      description: "The target user",
                      type: "USER",
                      required: true,
                    },
                    {
                      name: "valo-account",
                      description: "The name of the users valorant account",
                      type: "STRING",
                      required: true,
                    },
                  ],
                },
                {
                  name: "refresh",
                  description: "Refresh a users valorant account",
                  type: "SUB_COMMAND",
                  options: [
                    {
                      name: "user",
                      description: "The target user",
                      type: "USER",
                      required: true,
                    },
                    {
                      name: "region",
                      description: "The users valorant accounts server region",
                      type: "STRING",
                      required: true,
                      choices: [
                        { name: "Europe", value: "eu" },
                        { name: "Asia Pacific", value: "ap" },
                        { name: "North America", value: "na" },
                        { name: "Korea", value: "kr" },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
          handler: async (interaction: CommandInteraction) => {
            const subCommandGroup = interaction.options.getSubcommandGroup();
            const subCommand = interaction.options.getSubcommand();

            interaction.deferReply({ ephemeral: true });
            switch (subCommandGroup) {
              case "user":
                {
                  switch (subCommand) {
                    case "link":
                      {
                        const { value: targetDiscordId } =
                          interaction.options.get("user");
                        const { value: valorantAccount } =
                          interaction.options.get("valo-account");
                        const splitUser = (valorantAccount as string).split(
                          "#"
                        );

                        const dbUser = await dbManager.getUser({
                          discordId: targetDiscordId,
                        });

                        if (splitUser.length !== 2) {
                          interaction.followUp({
                            content:
                              "The valorant account must be in the format of `username#tag`",
                            ephemeral: true,
                          });
                          return;
                        }

                        const user = await api.getUser(
                          splitUser[0],
                          splitUser[1]
                        );

                        if (!user) {
                          interaction.followUp({
                            content: "The user does not exist",
                            ephemeral: true,
                          });
                          return;
                        }

                        const linkResponse = await api.linkUser(user, dbUser);

                        if (
                          linkResponse[0] ===
                            LinkUserResponseTypes.ALREADY_LINKED ||
                          linkResponse[0] ===
                            LinkUserResponseTypes.DIFFERENT_ACCOUNT_LINKED
                        ) {
                          interaction.followUp({
                            content: `The user <@${targetDiscordId}> already has a valorant account in **${user.region.toUpperCase()}** linked to their discord account`,
                            ephemeral: true,
                          });
                          return;
                        }

                        interaction.followUp({
                          content: `The valorant account **${user.name}#${user.tag}** has been linked to the discord user <@${targetDiscordId}>`,
                          ephemeral: true,
                        });
                      }
                      break;
                    case "refresh":
                      {
                        const { value: targetDiscordId } =
                          interaction.options.get("user");
                        const { value: region } =
                          interaction.options.get("region");

                        const dbUser = await dbManager.getUser({
                          discordId: targetDiscordId,
                        });
                        const [resp, user] = await api.refreshUser(
                          dbUser,
                          region as string
                        );

                        if (!user) {
                          if (resp === RefreshUserResponseTypes.NOT_LINKED) {
                            interaction.followUp({
                              content:
                                "The user does not have a valorant account linked for that region",
                              ephemeral: true,
                            });
                            break;
                          } else {
                            // NO ELO FOUND
                            interaction.followUp({
                              content:
                                "The data for that user and that region could not be updated.",
                              ephemeral: true,
                            });
                            break;
                          }
                        }
                        interaction.followUp({
                          content: `The valorant account for <@${targetDiscordId}> has been refreshed:\n**${
                            user.name
                          }#${user.tag}** (${
                            user.currenttier !== 0
                              ? `<:${
                                  emojis
                                    .find((e) => e?.tier === user.currenttier)
                                    .getValoEmoji(interaction.client).identifier
                                }> ${user.currenttierpatched}`
                              : "No ranked data"
                          })`,
                          ephemeral: true,
                        });
                      }
                      break;
                  }
                }
                break;
            }
          },
        } as CustomApplicationCommand;
      },
    } as SlashCommandTemplate;
  }
}
