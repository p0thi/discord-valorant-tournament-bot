import mongoose, { Mongoose } from "mongoose";
import IGuild from "./interfaces/IGuild";
import IUser from "./interfaces/IUser";
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
    const url = `mongodb://${process.env.MONGO_URL}:${
      process.env.MONGO_PORT ?? 27017
    }/${this.path}`;
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
}
