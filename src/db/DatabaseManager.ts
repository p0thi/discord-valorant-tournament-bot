import { DMChannel, User } from "discord.js";
import mongoose, { Mongoose } from "mongoose";
import Conversation from "../Conversation";
import InteractionHandler from "../handlers/InteractionHandler";
import IGuild, { ITournamentSetting } from "./interfaces/IGuild";
import IUser, { IValoAccountInfo } from "./interfaces/IUser";
import GuildModel from "./models/DatabaseGuild";

import UserModel from "./models/DatabaseUser";

export default class DatabaseManager {
  private static _instance: DatabaseManager;
  path: String;
  conn: Mongoose;

  private constructor(path: String) {
    this.path = path;
  }

  public static getInstance(): DatabaseManager {
    if (!this._instance) {
      this._instance = new DatabaseManager("discord-tournament");
    }
    return this._instance;
  }

  async connect() {
    const url = `mongodb://${process.env.MONGO_USER}:${
      process.env.MONGO_PASSWORD
    }@${process.env.MONGO_URL}:${process.env.MONGO_PORT ?? 27017}/${
      this.path
    }?authSource=admin`;
    console.log("DB connecting to:", url);
    this.conn = await mongoose.connect(url, {
      useNewUrlParser: true,
    });
  }

  async getUser(cond: Object, content?: Object): Promise<IUser> {
    let user = await UserModel.findOne(cond).exec();
    if (!user) {
      user = await UserModel.create(content ?? cond);
    }
    return user;
  }

  async getGuild(cnd: Object, content?: Object): Promise<IGuild> {
    let guild = await GuildModel.findOne(cnd).exec();
    if (!guild) {
      guild = await GuildModel.create(content ?? cnd);
    }
    return guild;
  }

  async getTournamentsWithUser(dbUser: IUser): Promise<ITournamentSetting[]> {
    const guilds = await GuildModel.find({
      "tournamentSettings.participants": dbUser,
    }).exec();
    const result: ITournamentSetting[] = [];
    for (const guild of guilds) {
      for (const tournament of guild.tournamentSettings) {
        if (tournament.participants.includes(dbUser.id)) {
          result.push(tournament);
        }
      }
    }
    return result;
  }

  getDbUserMaxElo(dbUser: IUser): [IValoAccountInfo, typeof regions[number]] {
    let currentResult;
    let currentResultRegion;

    for (const region of regions) {
      const currentValoAccount = dbUser[`${region}_account`];

      if (currentValoAccount) {
        if (currentResult) {
          if (currentValoAccount.elo > currentResult.elo) {
            currentResult = currentValoAccount;
            currentResultRegion = region;
          }
        } else if (currentValoAccount.elo > 0) {
          currentResult = currentValoAccount;
          currentResultRegion = region;
        }
      }
    }
    return [currentResult, currentResultRegion];
  }

  removeUserFromTournament(
    dbUser: IUser,
    tournament: ITournamentSetting
  ): string | void {
    if (!tournament.participants.includes(dbUser.id)) {
      return `<@${dbUser.discordId}> is not in this tournament`;
    }

    tournament.participants.remove(dbUser);
    InteractionHandler.leaveGroups(dbUser, tournament);
    return undefined;
  }

  addUserToTournament(
    dbUser: IUser,
    tournament: ITournamentSetting,
    user?: User
  ): string | void {
    if (tournament.participants.length >= 100) {
      return "The tournament is full.";
    }

    if (tournament.participants.includes(dbUser.id)) {
      return `<@${dbUser.discordId}> is already in the tournament.`;
    }

    const [highestUserValoAccount] = this.getDbUserMaxElo(dbUser);
    if (!highestUserValoAccount) {
      return `At least one of <@${dbUser.discordId}>s linked valorant accounts needs to have a rank.`;
    }

    if (
      dbUser[`${tournament.region}_account`] &&
      dbUser[`${tournament.region}_account`].puuid
    ) {
      tournament.participants.addToSet(dbUser);
      return undefined;
    }

    if (user) {
      user.createDM().then(async (dmChannel) => {
        const noValoAccountWarning = `You have not linked a Valorant account for the region **${tournament.region.toUpperCase()}** yet!`;
        dmChannel.send({
          content: `${noValoAccountWarning}`,
        });
        const conversation = await Conversation.createLinkConversation(
          dmChannel as DMChannel,
          user
        );
        conversation.start();
      });
    }
    return `<@${dbUser.discordId}> does not have valorant account linked for that region.\nThe \`/link\` command can be used to link an account.`;
  }
}

export const regions = ["na", "eu", "kr", "ap"];
