import {
  CommandInteraction,
  Guild,
  Snowflake,
  TextChannel,
  UserResolvable,
} from "discord.js";
import DatabaseManager from "../../db/DatabaseManager";
import IGuild, { ITournamentSetting } from "../../db/interfaces/IGuild";
import InteractionHandler from "../../handlers/InteractionHandler";
import TournamentManager from "../../managers/TournamentManager";
import TournamentMessage from "../../TournamentMessage";
import CustomApplicationCommand, {
  CommandPermissionRole,
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
    const role = CommandPermissionRole.MOD;
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
                  {
                    name: "add",
                    description: "Add a player to a tournament",
                    type: "SUB_COMMAND",
                    options: [
                      {
                        name: "tournament",
                        description: "The tournament to add to",
                        type: "STRING",
                        required: true,
                        choices: guildTournaments,
                      },
                      {
                        name: "player",
                        description: "The player to add",
                        type: "USER",
                        required: true,
                      },
                    ],
                  },
                ]
              : []),
          ],
          handler: async (interaction: CommandInteraction) => {
            const subCommand = interaction.options.getSubcommand();

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

                  if (
                    !channel
                      .permissionsFor(botMember)
                      .has("USE_PUBLIC_THREADS") ||
                    !channel.permissionsFor(botMember).has("MANAGE_THREADS")
                  ) {
                    interaction.followUp({
                      content:
                        ":x: I don't have the permission to use/manage public threads.\n(Needed to create/delete threads od tournaments)",
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
                  await dbGuild.save();
                  tournament = dbGuild.tournamentSettings.find(
                    (t) => t.name === name && t.region === region
                  );

                  const tournamentManager = new TournamentManager(
                    this.guild,
                    tournament
                  );

                  await dbGuild.save();
                  this.notifyObservers();

                  interaction.followUp({
                    content: `Tournament created: **${name}**${
                      !channel.permissionsFor(botMember).has("MANAGE_MESSAGES")
                        ? "\n`I could automatically pin my messages if I had the permission to manage messages.` :blush:"
                        : ""
                    }`,
                    ephemeral: true,
                  });
                }
                break;
              case "delete":
                {
                  const { value: tournament } =
                    interaction.options.get("tournament");

                  const tournamentIndex = dbGuild.tournamentSettings.findIndex(
                    (t) => t.id === tournament
                  );

                  const deletedMessages = await new TournamentManager(
                    this.guild,
                    dbGuild.tournamentSettings[tournamentIndex]
                  ).tournamentMessage.deleteAllMessages();
                  await dbGuild.save();

                  if (!deletedMessages) {
                    interaction.followUp({
                      content:
                        ":x: Could not delete tournament messages. Maybe Permission for thread channels missing?",
                      ephemeral: true,
                    });
                    return;
                  }

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

                  tournamentManager.tournamentMessage
                    .getThread()
                    .then((thread) => {
                      if (!thread) {
                        return;
                      }
                      thread.members.remove(player as Snowflake);
                    });

                  interaction.followUp({
                    content: `Player <@${dbUserToKick.discordId}> kicked.`,
                    ephemeral: true,
                  });
                }
                break;
              case "add":
                {
                  const { value: tournamentId } =
                    interaction.options.get("tournament");
                  const { value: player } = interaction.options.get("player");

                  const dbUserToAdd = await dbManager.getUser({
                    discordId: player,
                  });
                  const tournament =
                    dbGuild.tournamentSettings.id(tournamentId);

                  if (
                    !dbUserToAdd[`${tournament.region}_account`] ||
                    !dbUserToAdd[`${tournament.region}_account`].puuid
                  ) {
                    interaction.followUp({
                      content:
                        "That player does not have valorant account linked for that region.",
                      ephemeral: true,
                    });
                    return;
                  }

                  const tournamentManager = new TournamentManager(
                    this.guild,
                    tournament
                  );

                  if (tournament.participants.length >= 100) {
                    interaction.followUp({
                      content: "The tournament is full.",
                      ephemeral: true,
                    });
                    return;
                  }

                  if (tournament.participants.includes(dbUserToAdd.id)) {
                    interaction.followUp({
                      content: "That player is already in the tournament.",
                      ephemeral: true,
                    });
                    return;
                  }

                  tournament.participants.addToSet(dbUserToAdd);
                  await tournament.ownerDocument().save();

                  tournamentManager.tournamentMessage.editAllMessages();

                  tournamentManager.tournamentMessage
                    .getThread()
                    .then((thread) => {
                      if (!thread) {
                        return;
                      }
                      thread.members.add(player as Snowflake);
                    });

                  interaction.followUp({
                    content: `Player <@${dbUserToAdd.discordId}> added.`,
                    ephemeral: true,
                  });
                }
                break;
              default: {
                const group = interaction.options.getSubcommandGroup();
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
