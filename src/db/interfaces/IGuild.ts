import { Document, Types } from "mongoose";
import { CommandPermissionRole } from "../../commands/CustomApplicationCommand";
import IUser from "./IUser";

export default interface IGuild extends Document {
  discordId: string;
  setupDone: boolean;

  permissions: IGuildPermission[];

  tournamentSettings: Types.DocumentArray<ITournamentSetting>;
}

export interface ITournamentSetting extends Types.Subdocument {
  name: string;
  description: string;
  region: "eu" | "na" | "ap" | "kr";
  channelId: string;
  messageIds: string[];
  teams: Types.DocumentArray<ITournamentTeam>;
  premades: Types.DocumentArray<IPremade>;
  participants: Types.Array<IUser>;
}

export interface ITournamentTeam extends Types.Subdocument {
  teamName: string;
  members: IUser[];
}

export interface IPremade extends Types.Subdocument {
  issuer: IUser;
  target: IUser;
}

export interface IGuildPermission {
  permission: CommandPermissionRole;
  roleId: string;
}
