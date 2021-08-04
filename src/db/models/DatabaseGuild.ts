import { model, Schema } from "mongoose";
import { CommandPermissionRole } from "../../commands/CustomApplicationCommand";
import { regions } from "../DatabaseManager";
import IGuild from "../interfaces/IGuild";

const tournamentTeamSchema: Schema = new Schema({
  teamName: { type: String, required: true, unique: true, sparse: true },
  members: [{ type: Schema.Types.ObjectId, ref: "User" }],
});

const premadesSchema: Schema = new Schema(
  {
    issuer: { type: Schema.Types.ObjectId, ref: "User" },
    target: { type: Schema.Types.ObjectId, ref: "User" },
  },
  {
    timestamps: true,
  }
);

const tournamentSettingsSchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      sparse: true,
    },
    description: { type: String, required: false },
    region: {
      type: String,
      required: true,
      enum: regions,
    },
    channelId: { type: String, required: true },
    messageIds: [{ type: String, required: false }],
    mainMessageId: { type: String, required: false },
    teams: [tournamentTeamSchema],
    premades: [premadesSchema],
    participants: [
      { type: Schema.Types.ObjectId, ref: "User" /* , index: {} */ },
    ],
  },
  {
    timestamps: true,
  }
);

tournamentSettingsSchema.index(
  { name: 1, region: 1 },
  { unique: true, sparse: true }
);

const guildPermissionSchema: Schema = new Schema(
  {
    permission: {
      type: String,
      required: true,
      enum: Object.values(CommandPermissionRole),
    },
    roleId: { type: String, required: true },
  },
  { _id: false, timestamps: true }
);

const guildSchema: Schema = new Schema(
  {
    discordId: { type: String, required: true, unique: true },
    setupDone: { type: Boolean, default: false },

    permissions: [guildPermissionSchema],

    tournamentSettings: [tournamentSettingsSchema],
  },
  {
    timestamps: true,
  }
);

const GuildModel = model<IGuild>("Guild", guildSchema);

export default GuildModel;
