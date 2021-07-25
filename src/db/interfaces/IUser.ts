import { Document, Types } from "mongoose";

export default interface IUser extends Document {
  discordId: `${bigint}`;
  eu_account: IValoAccountInfo;
  ap_account: IValoAccountInfo;
  na_account: IValoAccountInfo;
  kr_account: IValoAccountInfo;
}

export interface IValoAccountInfo extends Types.Subdocument {
  puuid: string;
  elo: number;
  currenttier: number;
  currenttierpatched: string;
  name: string;
  tag: string;
}
