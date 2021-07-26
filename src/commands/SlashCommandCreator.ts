import {
  ApplicationCommandPermissionData,
  CommandInteraction,
  Guild,
  MessageActionRow,
  MessageButton,
  TextChannel,
} from "discord.js";
import ValorantApi from "../api/ValorantApi";
import DatabaseManager from "../db/DatabaseManager";
import { IValoAccountInfo } from "../db/interfaces/IUser";
import CustomApplicationCommand, {
  CommandPermissionRoles,
} from "./CustomApplicationCommand";
import { v1 as uuidv1 } from "uuid";
import IGuild, { ITournamentSetting } from "../db/interfaces/IGuild";
import TournamentCommand from "./guild_commands/TournamentCommand";
import IGuildCommand from "./guild_commands/IGuildCommand";
import PermissionCommand from "./guild_commands/PermissionCommand";

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

        api
          .getUser(splitName[0], splitName[1])
          .then(async (user) => {
            if (user) {
              console.log(user);
              let valoAccountInfo = dbUser[
                `${user.data.region}_account`
              ] as IValoAccountInfo;

              if (!valoAccountInfo) {
                valoAccountInfo = {} as IValoAccountInfo;
                dbUser[`${user.data.region}_account`] = valoAccountInfo;
                await dbUser.save();
                valoAccountInfo = dbUser[
                  `${user.data.region}_account`
                ] as IValoAccountInfo;
              }

              if (valoAccountInfo.puuid) {
                if (valoAccountInfo.puuid === user.data.puuid) {
                  interaction.followUp({
                    content: `You already have linked this account: **${user.data.name}#${user.data.tag}**`,
                    ephemeral: true,
                  });
                  return;
                }

                console.log("account set");

                const overwriteId = uuidv1();
                const abortId = uuidv1();
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
                  content: `You already have a Valorant account in **${user.data.region.toUpperCase()}** linked (${
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
                      valoAccountInfo.puuid = user.data.puuid;

                      const eloData = await api.getEloByPuuidAndRegion(
                        user.data.puuid,
                        user.data.region
                      );

                      if (eloData) {
                        valoAccountInfo.elo = eloData.elo;
                        valoAccountInfo.currenttier = eloData.currenttier;
                        valoAccountInfo.currenttierpatched =
                          eloData.currenttierpatched;
                        valoAccountInfo.name = eloData.name;
                        valoAccountInfo.tag = eloData.tag;

                        // dbUser[`${user.data.region}_account`] = valoAccountInfo;
                      }

                      await dbUser.save();

                      // await collected.deferUpdate();
                      collected.reply({
                        content: `Linked **${valoAccountInfo.name}#${
                          valoAccountInfo.tag
                        }** (Level ${
                          user.data.account_level
                        }) to your discord account for the server region **${user.data.region.toUpperCase()}**.`,
                        ephemeral: true,
                      });
                    } else if (content === abortId) {
                      console.log("abort");
                      collected.reply({
                        content: "Aborted",
                        ephemeral: true,
                      });
                    }
                  });
              } else {
                valoAccountInfo.puuid = user.data.puuid;

                const eloData = await api.getEloByPuuidAndRegion(
                  user.data.puuid,
                  user.data.region
                );

                console.log(eloData);

                if (eloData) {
                  valoAccountInfo.elo = eloData.elo;
                  valoAccountInfo.currenttier = eloData.currenttier;
                  valoAccountInfo.currenttierpatched =
                    eloData.currenttierpatched;
                  valoAccountInfo.name = eloData.name;
                  valoAccountInfo.tag = eloData.tag;
                  // dbUser[`${user.data.region}_account`] = valoAccountInfo;
                } else {
                  valoAccountInfo.elo = 0;
                  valoAccountInfo.currenttier = 10;
                  valoAccountInfo.currenttierpatched = "Estimated: Silver 2";
                  valoAccountInfo.name = user.data.name;
                  valoAccountInfo.tag = user.data.tag;
                }

                await dbUser.save();

                interaction.followUp({
                  content: `Linked **${valoAccountInfo.name}#${
                    valoAccountInfo.tag
                  }** (Level ${
                    user.data.account_level
                  }) to your discord account for the server reqion **${user.data.region.toUpperCase()}**.`,
                  ephemeral: true,
                });
              }
            } else {
              interaction.followUp({
                content: `Couldn't find Valorant user **${valoUserName}**`,
                ephemeral: true,
              });
            }
          })
          .catch((error) => {});
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

        const valoAccountInfo = dbUser[`${region}_account`] as IValoAccountInfo;

        interaction.defer({ ephemeral: true });

        if (!valoAccountInfo || !valoAccountInfo.puuid) {
          interaction.followUp({
            content:
              "You don't have a Valorant account linked for that region.",
            ephemeral: true,
          });
          return;
        }

        api
          .getEloByPuuidAndRegion(valoAccountInfo.puuid, region as string)
          .then(async (data) => {
            if (!data) {
              interaction.followUp({
                content:
                  "Couldn't get Elo data.\nMaybe it has been a long time since you played a competetive match?",
                ephemeral: true,
              });
              return;
            }

            valoAccountInfo.elo = data.elo;
            valoAccountInfo.currenttier = data.currenttier;
            valoAccountInfo.currenttierpatched = data.currenttierpatched;
            valoAccountInfo.name = data.name;
            valoAccountInfo.tag = data.tag;
            await dbUser.save();

            interaction.followUp({
              content: `Refreshed the Valorant account info for **${valoAccountInfo.name}#${valoAccountInfo.tag}**.`,
              ephemeral: true,
            });
          });
      },
    } as CustomApplicationCommand,
  ];

  static async getAllGuildCommands(guild: Guild): Promise<IGuildCommand[]> {
    const commands = [
      TournamentCommand.getInstance(guild),
      PermissionCommand.getInstance(guild),
    ];
    return commands;
  }
}

export interface SlashCommandTemplate {
  name: string;
  role?: CommandPermissionRoles;
  defaultPermission: boolean;
  forOwner: boolean;
  permissions: ApplicationCommandPermissionData[];
  create: () => CustomApplicationCommand;
}
