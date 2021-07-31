import {
  ApplicationCommandPermissionData,
  CommandInteraction,
  Guild,
  MessageActionRow,
  MessageButton,
  MessageEmbed,
  TextChannel,
} from "discord.js";
import ValorantApi, {
  LinkUserResponseTypes,
  RefreshUserResponseTypes,
} from "../api/ValorantApi";
import DatabaseManager from "../db/DatabaseManager";
import { IValoAccountInfo } from "../db/interfaces/IUser";
import CustomApplicationCommand, {
  CommandPermissionRole,
} from "./CustomApplicationCommand";
import { v1 as uuidv1 } from "uuid";
import IGuild, { ITournamentSetting } from "../db/interfaces/IGuild";
import TournamentCommand from "./guild_commands/TournamentCommand";
import IGuildCommand from "./guild_commands/IGuildCommand";
import PermissionCommand from "./guild_commands/PermissionCommand";
import ModerateCommand from "./guild_commands/ModerateCommand";

const api = ValorantApi.getInstatnce();
const dbManager = DatabaseManager.getInstance();

export default abstract class SlashCommandCreator {
  static globalCommands: CustomApplicationCommand[] = [
    {
      name: "link",
      description:
        "Lets you link your Valorant account to your discord account",
      defaultPermission: true,
      options: [
        {
          name: "valorant-name",
          description:
            "The name of the Valorant account you want to link e.g. Name#123",
          type: "STRING",
          required: true,
        },
      ],
      async handler(interaction: CommandInteraction) {
        const dbUser = await dbManager.getUser({
          discordId: interaction.user.id,
        });

        const { value: valoUserName } =
          interaction.options.get("valorant-name");
        const splitName = String(valoUserName).split("#");

        await interaction.defer({ ephemeral: true });

        api.getUser(splitName[0], splitName[1]).then((user) => {
          api
            .linkUser(user, dbUser)
            .then(async (resp) => {
              console.log("response", resp);
              switch (resp[0]) {
                case LinkUserResponseTypes.ALREADY_LINKED:
                  interaction.followUp({
                    content: `You already have linked this account: **${user.name}#${user.tag}**`,
                    ephemeral: true,
                  });
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
                  await interaction.followUp({
                    content: `You already have a Valorant account in **${user.region.toUpperCase()}** linked (${
                      valoAccountInfo.name
                    }#${valoAccountInfo.tag}). Do you want to replace it?`,
                    ephemeral: true,
                    components: [row],
                  });

                  interaction.channel
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
                          ephemeral: true,
                          content: `Successfully overwrote your account with **${user.name}#${user.tag}**.`,
                        });
                      } else if (content === abortId) {
                        console.log("abort");
                        collected.reply({
                          content: "Aborted",
                          ephemeral: true,
                        });
                      }
                    });
                  break;
                case LinkUserResponseTypes.NOT_FOUND:
                  interaction.followUp({
                    content: `Could not find a Valorant account with the name **${valoUserName}**`,
                    ephemeral: true,
                  });
                  break;
                case LinkUserResponseTypes.OK:
                  interaction.followUp({
                    content: `Linked **${user.name}#${user.tag}** (Level ${
                      user.account_level
                    }) to your discord account for the server reqion **${user.region.toUpperCase()}**.`,
                    ephemeral: true,
                  });
                  break;
              }
            })
            .catch((error) => {});
        });
      },
    } as CustomApplicationCommand,
    {
      name: "refresh",
      description: "Refreshes your Valorant account info",
      defaultPermission: true,
      options: [
        {
          name: "region",
          description: "Your valoran accounts server region",
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
      async handler(interaction: CommandInteraction) {
        const { value: region } = interaction.options.get("region");

        const dbUser = await dbManager.getUser({
          discordId: interaction.user.id,
        });

        interaction.defer({ ephemeral: true });

        const refreshResp = await api.refreshUser(dbUser, region as string);

        const valoAccountInfo = dbUser[`${region}_account`] as IValoAccountInfo;

        switch (refreshResp[0]) {
          case RefreshUserResponseTypes.OK:
            {
              interaction.followUp({
                content: `Refreshed the Valorant account info for **${valoAccountInfo.name}#${valoAccountInfo.tag}**.`,
                ephemeral: true,
              });
            }
            break;
          case RefreshUserResponseTypes.NO_ELO_FOUND:
            {
              interaction.followUp({
                content:
                  "Couldn't get Elo data.\nMaybe it has been a long time since you played a competetive match?",
                ephemeral: true,
              });
            }
            break;
          case RefreshUserResponseTypes.NOT_LINKED:
            {
              interaction.followUp({
                content: `You are not linked to a Valorant account for the region **${(
                  region as string
                ).toUpperCase()}**.`,
                ephemeral: true,
              });
            }
            break;
        }
      },
    } as CustomApplicationCommand,
    {
      name: "help",
      description: "Shows help message",
      defaultPermission: true,
      async handler(interaction: CommandInteraction) {
        interaction.reply({
          ephemeral: true,
          embeds: [
            {
              title: "All commands and a description",
              fields: [
                {
                  name: "\u200b",
                  value: "**GLOBAL COMMANDS:**",
                },
                {
                  name: "/link",
                  value:
                    "Tell the bot your valo account. it automatically detects the server region of that account.",
                },
                {
                  name: "/refresh",
                  value:
                    "Refreshes your Valorant account info for a region (eg rank).",
                },
                {
                  name: "\u200b",
                  value: "**SERVER COMMANDS:**",
                },
                {
                  name: "/tournament",
                  value:
                    "Needs **MOD** permissions.\nCreate/delete/edit tournament in the current text channel.",
                },
                {
                  name: "/permission",
                  value:
                    "Needs **ADMIN** permissions.\nGrant/revoke/list the MOD or ADMIN permissions to a discord group (not inclusive: roles with ADMIN permissions do not automatically have MOD permissions and should be granted both).",
                },
                {
                  name: "/moderate",
                  value:
                    "Needs **MOD** permissions.\nModerate the bot, users, ...",
                },
              ],
            } as MessageEmbed,
          ],
        });
      },
    } as CustomApplicationCommand,
  ];

  static async getAllGuildCommands(guild: Guild): Promise<IGuildCommand[]> {
    const commands = [
      TournamentCommand.getInstance(guild),
      PermissionCommand.getInstance(guild),
      ModerateCommand.getInstance(guild),
    ];
    return commands;
  }
}

export interface SlashCommandTemplate {
  name: string;
  role?: CommandPermissionRole;
  defaultPermission: boolean;
  forOwner: boolean;
  permissions: ApplicationCommandPermissionData[];
  create: () => CustomApplicationCommand;
}
