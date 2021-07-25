import { CommandInteraction, Guild, TextChannel } from "discord.js";
import DatabaseManager from "../../db/DatabaseManager";
import IGuild, { ITournamentSetting } from "../../db/interfaces/IGuild";
import InteractionHandler from "../../handlers/InteractionHandler";
import TournamentManager from "../../managers/TournamentManager";
import TournamentMessage from "../../TournamentMessage";
import CustomApplicationCommand, {
  CommandPermissionRoles,
} from "../CustomApplicationCommand";
import { SlashCommandTemplate } from "../SlashCommandCreator";
import AObservableCommand from "./AObservableCommand";
import IGuildCommand from "./IGuildCommand";
import IGuildCommandObserver from "./IGuildCommandObserver";

const dbManager = DatabaseManager.getInstance();

export default class TournamentCommand
  extends AObservableCommand
  implements IGuildCommand
{
  private static _tournamentCommands: Map<Guild, TournamentCommand> = new Map();

  guild: Guild;

  private constructor(guild: Guild) {
    super();
    this.guild = guild;
  }

  public static getInstance(guild: Guild): TournamentCommand {
    if (TournamentCommand._tournamentCommands.has(guild)) {
      return TournamentCommand._tournamentCommands.get(guild);
    }
    const instance = new TournamentCommand(guild);
    TournamentCommand._tournamentCommands.set(guild, instance);
    return instance;
  }

  async generateTemplate(): Promise<SlashCommandTemplate> {
    const role = CommandPermissionRoles.MOD;
    const templateDbGuild = await dbManager.getGuild({
      discordId: this.guild.id,
    });
    return {
      name: "tournament",
      forOwner: false,
      defaultPermission: false,
      role,
      create: (): CustomApplicationCommand => {
        const guildTournaments = templateDbGuild.tournamentSettings.map(
          (t) => ({
            name: `${t.name} (${t.region})`,
            value: t.id,
          })
        );

        return {
          name: "tournament",
          description: "Create or edit a tournament",
          defaultPermission: false,
          options: [
            {
              name: "create",
              description: "Create a new tournament",
              type: "SUB_COMMAND",
              options: [
                {
                  name: "region",
                  description: "The region of the tournament",
                  type: "STRING",
                  required: true,
                  choices: [
                    { name: "Europe", value: "eu" },
                    { name: "Asia Pacific", value: "ap" },
                    { name: "North America", value: "na" },
                    { name: "Korea", value: "kr" },
                  ],
                },
                {
                  name: "name",
                  description: "The name of the tournament",
                  type: "STRING",
                  required: true,
                },
              ],
            },
            ...(guildTournaments && guildTournaments.length > 0
              ? [
                  {
                    name: "edit",
                    description: "Edit an existing tournament",
                    type: "SUB_COMMAND_GROUP",
                    options: [
                      {
                        name: "name",
                        description: "Rename the tournament",
                        type: "SUB_COMMAND",
                        options: [
                          {
                            name: "tournament",
                            description: "The tournament to rename",
                            type: "STRING",
                            required: true,
                            choices: guildTournaments,
                          },
                          {
                            name: "name",
                            description: "The new name of the tournament",
                            type: "STRING",
                            required: true,
                          },
                        ],
                      },
                      {
                        name: "description",
                        description: "Change the description of the tournament",
                        type: "SUB_COMMAND",
                        options: [
                          {
                            name: "tournament",
                            description: "The tournament to rename",
                            type: "STRING",
                            required: true,
                            choices: guildTournaments,
                          },
                          {
                            name: "description",
                            description:
                              "The new description of the tournament",
                            type: "STRING",
                            required: true,
                          },
                        ],
                      },
                    ],
                  },
                  {
                    name: "delete",
                    description: "Delete a tournament",
                    type: "SUB_COMMAND",
                    options: [
                      {
                        name: "tournament",
                        description: "The tournament to delete",
                        type: "STRING",
                        required: true,
                        choices: guildTournaments,
                      },
                    ],
                  },
                  {
                    name: "kick",
                    description: "Kick a player from a tournament",
                    type: "SUB_COMMAND",
                    options: [
                      {
                        name: "tournament",
                        description: "The tournament to kick from",
                        type: "STRING",
                        required: true,
                        choices: guildTournaments,
                      },
                      {
                        name: "player",
                        description: "The player to kick",
                        type: "USER",
                        required: true,
                      },
                    ],
                  },
                ]
              : []),
          ],
          handler: async (interaction: CommandInteraction) => {
            const subCommand = interaction.options.getSubCommand();

            interaction.defer({ ephemeral: true });

            const dbGuild = await dbManager.getGuild({
              discordId: this.guild.id,
            });

            const botMember = this.guild.members.cache.get(
              interaction.client.user.id
            );
            const channel = interaction.channel as TextChannel;

            switch (subCommand) {
              case "create":
                {
                  const { value: region } = interaction.options.get("region");
                  const { value: name } = interaction.options.get("name");

                  console.log(region, name);

                  if (
                    !channel.permissionsFor(botMember).has("SEND_MESSAGES") ||
                    !channel.permissionsFor(botMember).has("VIEW_CHANNEL")
                  ) {
                    interaction.followUp({
                      content:
                        "I don't have the permission to send or view messages in that channel.",
                      ephemeral: true,
                    });
                    return;
                  }

                  let tournament = {
                    name,
                    region,
                    channelId: channel.id,
                  } as ITournamentSetting;

                  dbGuild.tournamentSettings.push(tournament);
                  dbGuild.save();
                  tournament = dbGuild.tournamentSettings.find(
                    (t) => t.name === name && t.region === region
                  );

                  const tournamentManager = new TournamentManager(
                    this.guild,
                    tournament
                  );

                  interaction.followUp({
                    content: `Tournament created: **${name}**`,
                    ephemeral: true,
                  });
                  const messages =
                    await tournamentManager.tournamentMessage.getMessages();
                  tournament.messageIds = messages.map((m) => m.id);
                  await dbGuild.save();
                  this.notifyObservers();
                }
                break;
              case "delete":
                {
                  const { value: tournament } =
                    interaction.options.get("tournament");

                  const tournamentIndex = dbGuild.tournamentSettings.findIndex(
                    (t) => t.id === tournament
                  );

                  await new TournamentManager(
                    this.guild,
                    dbGuild.tournamentSettings[tournamentIndex]
                  ).tournamentMessage.deleteAllMessages();
                  dbGuild.tournamentSettings.splice(tournamentIndex, 1);
                  await dbGuild.save();
                  this.notifyObservers();
                  interaction.followUp({
                    content: "Tournament deleted.",
                    ephemeral: true,
                  });
                }
                break;
              case "kick":
                {
                  const { value: tournamentId } =
                    interaction.options.get("tournament");
                  const { value: player } = interaction.options.get("player");
                  const dbUserToKick = await dbManager.getUser({
                    discordId: player,
                  });

                  const tournament =
                    dbGuild.tournamentSettings.id(tournamentId);
                  const tournamentManager = new TournamentManager(
                    this.guild,
                    tournament
                  );

                  if (!tournament.participants.includes(dbUserToKick.id)) {
                    interaction.followUp({
                      content: "That player is not in the tournament.",
                      ephemeral: true,
                    });
                    return;
                  }
                  tournament.participants.remove(dbUserToKick);
                  await InteractionHandler.leaveGroups(
                    dbUserToKick,
                    tournament
                  );
                  await tournament.ownerDocument().save();

                  tournamentManager.tournamentMessage.editAllMessages();

                  interaction.followUp({
                    content: `Player <@${dbUserToKick.discordId}> kicked.`,
                    ephemeral: true,
                  });
                }
                break;
              default: {
                const group = interaction.options.getSubCommandGroup();
                switch (group) {
                  case "edit":
                    {
                      switch (subCommand) {
                        case "name":
                          {
                            const { value: tournamentId } =
                              interaction.options.get("tournament");
                            const { value: newName } =
                              interaction.options.get("name");

                            const tournament = dbGuild.tournamentSettings.find(
                              (t) => t.id === tournamentId
                            );

                            const tournamentManager = new TournamentManager(
                              this.guild,
                              tournament
                            );

                            tournament.name = newName as string;
                            await tournament.ownerDocument().save();
                            tournamentManager.tournamentMessage.editAllMessages();

                            interaction.followUp({
                              content: "Name changed",
                              ephemeral: true,
                            });
                          }
                          break;
                        case "description":
                          {
                            const { value: newDescription } =
                              interaction.options.get("description");
                            const { value: tournamentId } =
                              interaction.options.get("tournament");

                            const tournament = dbGuild.tournamentSettings.find(
                              (t) => t.id === tournamentId
                            );

                            const tournamentManager = new TournamentManager(
                              this.guild,
                              tournament
                            );

                            tournament.description = newDescription as string;
                            await tournament.ownerDocument().save();
                            tournamentManager.tournamentMessage.editAllMessages();

                            interaction.followUp({
                              content: "Description changed",
                              ephemeral: true,
                            });
                          }
                          break;
                      }
                    }
                    break;
                }
              }
            }
          },
        } as CustomApplicationCommand;
      },
    } as SlashCommandTemplate;
  }

  notifyObservers() {
    this.observers.forEach((observer) => observer.commandChangeObserved(this));
  }
}
