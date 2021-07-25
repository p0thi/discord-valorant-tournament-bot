import { Snowflake } from "discord.js";
import { model, Schema } from "mongoose";
import IUser from "../interfaces/IUser";

const valoAccountSchema: Schema = new Schema(
  {
    puuid: { type: String, required: false },
    elo: { type: Number, required: false },
    currenttier: { type: Number, required: false },
    currenttierpatched: { type: String, required: false },
    name: { type: String, required: false },
    tag: { type: String, required: false },
  },
  {
    timestamps: true,
  }
);

const userSchema: Schema = new Schema(
  {
    discordId: { type: String, required: true, unique: true },
    eu_account: valoAccountSchema,
    ap_account: valoAccountSchema,
    na_account: valoAccountSchema,
    kr_account: valoAccountSchema,
  },
  {
    timestamps: true,
  }
);

const UserModel = model<IUser>("User", userSchema);

export default UserModel;
