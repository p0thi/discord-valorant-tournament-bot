import {
  Client,
  Interaction,
  MessageComponentInteraction,
  SelectMenuInteraction,
} from "discord.js";
import { Mongoose, Types } from "mongoose";
import DatabaseManager from "../db/DatabaseManager";
import { IPremade, ITournamentSetting } from "../db/interfaces/IGuild";
import IUser from "../db/interfaces/IUser";
import TournamentManager from "../managers/TournamentManager";
import TournamentMessage from "../TournamentMessage";

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

      const match = interaction.customId.match(idDegex);
      if (!match) return;

      const [_, command, guildId, tournamentId] = [...match];

      if (!guildId || interaction.guild?.id !== guildId) {
        interaction.deferUpdate();
        return;
      }
      interaction.defer({ ephemeral: true });

      const [dbGuild, dbUser] = await Promise.all([
        dbManager.getGuild({ discordId: guildId }),
        dbManager.getUser({
          discordId: interaction.user.id,
        }),
      ]);

      const tournament = dbGuild.tournamentSettings.id(tournamentId);
      const tournamentManager = new TournamentManager(
        interaction.guild,
        tournament
      );

      switch (command) {
        case "join_tournament":
          {
            if (tournament.participants.indexOf(dbUser.id) !== -1) {
              interaction.followUp(
                ":exclamation: You're already in this tournament!"
              );
              return;
            }

            const userValoAccountInfo = dbUser[`${tournament.region}_account`];

            if (!userValoAccountInfo) {
              interaction.followUp({
                content: `You have not linked a Valorant account for the region **${tournament.region.toUpperCase()}** yet!\nUse the /link command to do so.`,
                ephemeral: true,
              });
              return;
            }

            tournament.participants.addToSet(dbUser);
            await tournament.ownerDocument().save();
            tournamentManager.tournamentMessage.editAllMessages();

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

            interaction.followUp({
              content: "You have left the tournament!",
              ephemeral: true,
            });
          }
          break;
        case "group_select":
          {
            const selectMenuInteraction = interaction as SelectMenuInteraction;

            interaction;

            const otherParticipants = selectMenuInteraction.values.filter(
              (discordId) => discordId !== dbUser.discordId
            );
            // remove existing groups where the user ist the issuer
            tournament.premades = tournament.premades.filter(
              (p) => p.issuer.toString() !== dbUser.id
            ) as Types.DocumentArray<IPremade>;

            if (selectMenuInteraction.values.includes("none")) {
              if (selectMenuInteraction.values.length > 1) {
                interaction.followUp({
                  content:
                    ":exclamation: You cannot select **NONE** and other participants at once!",
                  ephemeral: true,
                });
                return;
              }
              tournament.premades = tournament.premades.filter(
                (p) => p.target.toString() !== dbUser.id
              ) as Types.DocumentArray<IPremade>;

              tournament.premades.addToSet({
                issuer: dbUser,
                target: undefined,
              });

              await tournament.ownerDocument().save();

              tournamentManager.tournamentMessage.editAllMessages();
              interaction.followUp({
                content: "You are now excluded from any premade groups.",
                ephemeral: true,
              });
              return;
            }

            const dbUsers = await Promise.all(
              otherParticipants.map(
                async (discordId) => await dbManager.getUser({ discordId })
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
            tournament.premades.addToSet(...premadeObjects);
            await tournament.ownerDocument().save();
            tournamentManager.tournamentMessage.editAllMessages();
          }
          break;
        case "leave_groups":
          {
            await InteractionHandler.leaveGroups(dbUser, tournament);

            interaction.followUp({
              content: "You are no longer a member of any premade groups.",
              ephemeral: true,
            });
            tournamentManager.tournamentMessage.editAllMessages();
          }
          break;
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
