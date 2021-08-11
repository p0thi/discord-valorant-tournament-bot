import {
  Client,
  DMChannel,
  Interaction,
  MessageComponentInteraction,
  SelectMenuInteraction,
} from "discord.js";
import { Mongoose, Types } from "mongoose";
import Conversation from "../Conversation";
import DatabaseManager from "../db/DatabaseManager";
import { IPremade, ITournamentSetting } from "../db/interfaces/IGuild";
import IUser from "../db/interfaces/IUser";
import TournamentManager from "../managers/TournamentManager";
import TournamentMessageManager from "../managers/TournamentMessageManager";

const dbManager = DatabaseManager.getInstance();
const idDegex = /([^#]*\S*)#{1}(\d+)_([a-f0-9]+)/s;

export default class InteractionHandler {
  bot: Client;

  constructor(bot: Client) {
    this.bot = bot;
  }

  start() {
    this.bot.on("interactionCreate", this.handle);
  }

  private async handle(interaction: Interaction): Promise<void> {
    if (interaction.isMessageComponent()) {
      // interaction as MessageComponentInteraction;

      if (interaction.channel.type === "DM") {
        switch (interaction.customId) {
          case "dm-help-selector":
            {
              interaction.deferUpdate();
              console.log(interaction.user);

              switch ((interaction as SelectMenuInteraction).values[0]) {
                case "link":
                  {
                    const conversation =
                      await Conversation.createLinkConversation(
                        interaction.channel as DMChannel,
                        interaction.user
                      );
                    conversation.start();
                  }
                  break;
                case "refresh":
                  {
                    const conversation =
                      await Conversation.createRefreshConversation(
                        interaction.channel as DMChannel,
                        interaction.user
                      );
                    conversation.start();
                  }
                  break;
              }
            }
            break;
        }
      } else {
        const tournamentMatch = interaction.customId.match(idDegex);
        if (tournamentMatch) {
          const [_, command, guildId, tournamentId] = [...tournamentMatch];

          if (!guildId || interaction.guild?.id !== guildId) {
            interaction.deferUpdate();
            return;
          }
          interaction.deferReply({ ephemeral: true });

          const [dbGuild, dbUser] = await Promise.all([
            dbManager.getGuild({ discordId: guildId }),
            dbManager.getUser({
              discordId: interaction.user.id,
            }),
          ]);

          const tournament = dbGuild.tournamentSettings.id(tournamentId);
          if (tournament) {
            const tournamentManager = new TournamentManager(
              interaction.guild,
              tournament
            );

            switch (command) {
              case "tournament_help":
                {
                  interaction.followUp({
                    content:
                      `If you want to join this tournament, you have to have a valorant acount of the ${tournament.region.toUpperCase()} region linked tou your discord account.\n` +
                      `To link a new account, you can either type \`/link\` in the chat followed by your valorant username (like \`YourName#1234\`), or you can write a DM to the bot. It will then lead you through the process of linking your account.`,
                    ephemeral: true,
                  });
                }
                break;
              case "join_tournament":
                {
                  if (tournament.participants.indexOf(dbUser.id) !== -1) {
                    interaction.followUp(
                      ":exclamation: You're already in this tournament!"
                    );
                    return;
                  }

                  if (tournament.participants.length >= 100) {
                    interaction.followUp(
                      ":exclamation: This tournament is full!"
                    );
                    return;
                  }

                  const userValoAccountInfo =
                    dbUser[`${tournament.region}_account`];

                  if (!userValoAccountInfo) {
                    const noValoAccountWarning = `You have not linked a Valorant account for the region **${tournament.region.toUpperCase()}** yet!`;
                    interaction.followUp({
                      content: `${noValoAccountWarning}\nUse the */link* command to do so, or write me a DM.`,
                      ephemeral: true,
                    });
                    const dmChannel = await interaction.user.createDM();
                    dmChannel.send({
                      content: `${noValoAccountWarning}`,
                    });
                    const conversation =
                      await Conversation.createLinkConversation(
                        dmChannel as DMChannel,
                        interaction.user
                      );
                    conversation.start();
                    return;
                  }

                  const [highestUserValoAccount] =
                    dbManager.getDbUserMaxElo(dbUser);

                  if (!highestUserValoAccount) {
                    interaction.followUp({
                      content:
                        ":exclamation: At least one of your linked valo accounts needs to have a rank.",
                      ephemeral: true,
                    });
                    return;
                  }

                  tournament.participants.addToSet(dbUser);
                  await tournament.ownerDocument().save();
                  tournamentManager.tournamentMessage.editAllMessages();

                  tournamentManager.tournamentMessage
                    .getThread()
                    .then((thread) => {
                      if (!thread) {
                        return;
                      }
                      thread.members.add(interaction.user);
                    });

                  interaction.followUp({
                    content: "You have joined the tournament!",
                    ephemeral: true,
                  });
                }
                break;
              case "leave_tournament":
                {
                  await InteractionHandler.leaveGroups(dbUser, tournament);
                  tournament.participants.remove(dbUser);
                  await tournament.ownerDocument().save();
                  tournamentManager.tournamentMessage.editAllMessages();

                  tournamentManager.tournamentMessage
                    .getThread()
                    .then((thread) => {
                      if (!thread) {
                        return;
                      }
                      thread.members.remove(interaction.user.id);
                    });

                  interaction.followUp({
                    content: "You have left the tournament!",
                    ephemeral: true,
                  });
                }
                break;
              case "group_select":
                {
                  const selectMenuInteraction =
                    interaction as SelectMenuInteraction;

                  if (
                    !tournament.participants.find(
                      (p) => p.toString() === dbUser.id.toString()
                    )
                  ) {
                    interaction.followUp({
                      content: "You're not in this tournament!",
                      ephemeral: true,
                    });
                    return;
                  }

                  const otherParticipants = selectMenuInteraction.values.filter(
                    (discordId) => discordId !== dbUser.discordId
                  );

                  const populatedTournament =
                    await tournamentManager.populateTournament();

                  // remove existing groups with the current submitted selection
                  populatedTournament.premades =
                    populatedTournament.premades.filter(
                      (p) =>
                        p.issuer.toString() !== dbUser.id.toString() &&
                        !selectMenuInteraction.values.includes(
                          p.target.discordId.toString()
                        )
                    ) as Types.DocumentArray<IPremade>;

                  if (
                    populatedTournament.premades.filter(
                      (p) => p.issuer.id.toString() === dbUser.id.toString()
                    ).length +
                      selectMenuInteraction.values.length >
                    5
                  ) {
                    interaction.followUp({
                      content: "You cannot select more than 5 people!",
                      ephemeral: true,
                    });
                    return;
                  }

                  const dbUsers = await Promise.all(
                    otherParticipants.map((discordId) =>
                      populatedTournament.participants.find(
                        (p) => p.discordId === discordId
                      )
                    )
                  );

                  interaction.followUp({
                    content: `You selected ${dbUsers
                      .map((u) => `<@${u.discordId}>`)
                      .join(", ")} to be your premade(s) if possible.`,
                    ephemeral: true,
                  });

                  const premadeObjects = dbUsers.map(
                    (u) =>
                      ({
                        issuer: dbUser,
                        target: u,
                      } as IPremade)
                  );
                  populatedTournament.premades.addToSet(...premadeObjects);
                  await populatedTournament.ownerDocument().save();
                  tournamentManager.tournamentMessage.editAllMessages();
                }
                break;
              case "leave_groups":
                {
                  if (
                    !tournament.participants.find((p) => {
                      console.log(p, dbUser.id);
                      return p.toString() === dbUser.id.toString();
                    })
                  ) {
                    interaction.followUp({
                      content: "You're not in this tournament!",
                      ephemeral: true,
                    });
                    return;
                  }

                  await InteractionHandler.leaveGroups(dbUser, tournament);

                  interaction.followUp({
                    content:
                      "You are no longer a member of any premade groups.",
                    ephemeral: true,
                  });
                  tournamentManager.tournamentMessage.editAllMessages();
                }
                break;
            }
          } else {
            interaction.followUp({
              content: "This tournament is not active.",
              ephemeral: true,
            });
          }
        }
      }
    }
  }

  static async leaveGroups(
    dbUser: IUser,
    tournamentSettings: ITournamentSetting
  ): Promise<void> {
    tournamentSettings.premades = tournamentSettings.premades.filter(
      (p) =>
        p.target.toString() !== dbUser.id.toString() &&
        p.issuer.toString() !== dbUser.id.toString()
    ) as Types.DocumentArray<IPremade>;

    await tournamentSettings.ownerDocument().save();
  }
}
