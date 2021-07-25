import { Client, Guild } from "discord.js";
import SlashCommandCreator from "../commands/SlashCommandCreator";
import DatabaseManager from "../db/DatabaseManager";
import IGuild from "../db/interfaces/IGuild";
import TournamentMessage from "../TournamentMessage";
import emojis from "../util/emojis";
import SlashCommandManager from "./SlashCommandManager";
import TournamentManager from "./TournamentManager";

const dbManager = DatabaseManager.getInstance();

export default class GuildManager {
  bot: Client;
  constructor(bot: Client) {
    this.bot = bot;
  }

  async setupGuild(bot: Client, dbGuild: IGuild): Promise<void> {
    if (dbGuild.setupDone) return;

    // bot.guilds.fetch(dbGuild.discordId).then((guild) => {
    //   bot.application.commands.cache.forEach(async (command) => {
    //     const customCommand = (
    //       await SlashCommandCreator.getAllGuildCommands(guild)
    //     ).map(c => c.generateTemplate()).find((i) => i.name === command.name);

    //     if (customCommand.forOwner && !customCommand.defaultPermission) {
    //       customCommand.permissions.add({
    //         permissions: [
    //           {
    //             id: guild.ownerId,
    //             type: "USER",
    //             permission: true,
    //           },
    //         ],
    //       });
    //     }
    //   });
    //   dbGuild.setupDone = true;
    //   dbGuild.save();
    // });

    const guild = await bot.guilds.cache.get(dbGuild.discordId);

    if (guild.id === process.env.EMOJI_GUILD_ID) {
      const guildEmojis = await guild.emojis.fetch();

      for (const guildEmoji of guildEmojis) {
        if (
          emojis.find((e) => {
            return !!e && e.name === guildEmoji[1].name;
          })
        )
          continue;

        guildEmoji[1].delete();
      }

      for (let i = 3; i <= 24; i++) {
        const emoji = emojis.find((e) => e?.tier === i);
        if (!emoji) continue;
        if (guildEmojis.find((e) => e.name === emoji.name)) continue;
        console.log(`## Adding ${emoji.name} to the guild`);
        guild.emojis
          .create(emoji?.value, emoji.name)
          .then((e) => {
            console.log(`Added ${e.name} to the guild`);
          })
          .catch((e) => {
            console.log(`Failed to add ${e.name} to the guild`);
            console.log(e.name);
          });
      }
    }
  }

  start(): void {
    this.bot.on("guildCreate", this.onGuildCreate);
    this.bot.on("guildDelete", this.onGuildDelete);

    // making sure every guild is in the database
    this.bot.guilds.cache.forEach((guild) => {
      dbManager.getGuild({ discordId: guild.id }).then((guildData) => {
        this.setupGuild(this.bot, guildData);
        guildData.tournamentSettings.forEach((t) => {
          new TournamentManager(guild, t).tournamentMessage.editAllMessages();
        });
      });
    });
  }

  private onGuildCreate(guild: Guild): void {
    dbManager.getGuild({ discordId: guild.id }).then((guildData) => {
      this.setupGuild(this.bot, guildData);
    });
  }

  private onGuildDelete(guild: Guild): void {
    dbManager
      .getGuild({ discordId: guild.id })
      .then((dbGuild) => dbGuild.delete());
  }
}
