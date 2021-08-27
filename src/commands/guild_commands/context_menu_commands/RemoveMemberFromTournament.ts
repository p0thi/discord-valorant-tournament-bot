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
import ValorantApi from "../../../api/ValorantApi";
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
import InteractionHandler from "../../../handlers/InteractionHandler";

const api = ValorantApi.getInstatnce();

export default class RemoveMemberFromTournament
  extends AObservableCommand
  implements IGuildContextMenuCommand
{
  private static _tournamentCommands: Map<Guild, RemoveMemberFromTournament> =
    new Map();
  guild: Guild;
  private constructor(guild: Guild) {
    super();
    this.guild = guild;
  }
  public static getInstance(guild: Guild): RemoveMemberFromTournament {
    if (RemoveMemberFromTournament._tournamentCommands.has(guild)) {
      return RemoveMemberFromTournament._tournamentCommands.get(guild);
    }
    const instance = new RemoveMemberFromTournament(guild);
    RemoveMemberFromTournament._tournamentCommands.set(guild, instance);
    return instance;
  }

  notifyObservers() {
    this.observers.forEach((observer) => observer.commandChangeObserved(this));
  }

  async generateTemplate(): Promise<SlashCommandTemplate> {
    const dbManager = DatabaseManager.getInstance();
    const role = CommandPermissionRole.MOD;
    const templateDbGuild = await dbManager.getGuild({
      discordId: this.guild.id,
    });
    return {
      name: "Kick From Tournament",
      forOwner: false,
      defaultPermission: false,
      role,
      create: (): CustomApplicationCommand => {
        return {
          name: "Kick From Tournament",
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

            const dbUser = await dbManager.getUser({ discordId: member.id });

            if (templateDbGuild.tournamentSettings.length === 0) {
              interaction.followUp({
                content: "No tournaments found.",
                ephemeral: true,
              });
              return;
            } else if (templateDbGuild.tournamentSettings.length === 1) {
              const tournamentManager = new TournamentManager(
                this.guild,
                templateDbGuild.tournamentSettings[0]
              );
              const tryToRemove = await tournamentManager.removeUser(dbUser);

              if (tryToRemove) {
                interaction.followUp({
                  content: tryToRemove[0],
                  ephemeral: true,
                });
                return;
              }

              interaction.followUp({
                content: `Player <@!${dbUser.discordId}> removed.`,
                ephemeral: true,
              });
              return;
            } else {
              const customId = `select_tournament_${uuidv1()}`;
              const collector =
                interaction.channel.createMessageComponentCollector({
                  componentType: "SELECT_MENU",
                  time: 60000,
                  max: 1,
                  filter: (i) => i.customId === customId,
                });

              collector.on("collect", async (i: SelectMenuInteraction) => {
                i.deferUpdate();
                if (!i) {
                  interaction.followUp({
                    content: "Aborting tournament selection...",
                    ephemeral: true,
                  });
                  return;
                }

                const tournamentsToRemoveFrom =
                  templateDbGuild.tournamentSettings.filter((t) =>
                    i.values.includes(t.id.toString())
                  );
                const removed = await Promise.all(
                  tournamentsToRemoveFrom.map(async (t) => {
                    return await new TournamentManager(
                      this.guild,
                      t
                    ).removeUser(dbUser);
                  })
                );
                console.log("removed", removed);
                i.followUp({
                  content: `Player <@!${dbUser.discordId}> removed from ${
                    removed.filter((a) => !a).length
                  } tournaments.`,
                  ephemeral: true,
                  embeds: [
                    {
                      title: `Tournaments you tried to remove ${member.displayName} from`,
                      fields: tournamentsToRemoveFrom.map((a) => {
                        const removedValue = removed.find(
                          (b) => !!b && b[1] === a.id.toString()
                        );
                        return {
                          inline: true,
                          name: a.name,
                          value:
                            removedValue && removedValue.length >= 1
                              ? `**Not removed.** Reason:\n${removedValue[0]}`
                              : "**REMOVED**",
                        };
                      }),
                    } as MessageEmbed,
                  ],
                });
                return;
              });
              interaction.followUp({
                content: "Please select a tournament.",
                ephemeral: true,
                components: [
                  new MessageActionRow().addComponents([
                    new MessageSelectMenu()
                      .setCustomId(customId)
                      .setPlaceholder("Please select tournament(s).")
                      .addOptions(
                        templateDbGuild.tournamentSettings.map(
                          (tournament) => ({
                            label: `${
                              tournament.name
                            } (${tournament.region.toUpperCase()})`,
                            value: tournament.id,
                          })
                        )
                      ),
                  ]),
                ],
              });
            }
          },
        } as CustomApplicationCommand;
      },
    } as SlashCommandTemplate;
  }
}
