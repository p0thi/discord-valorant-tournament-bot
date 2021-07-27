import axios, { AxiosResponse } from "axios";
import IUser, { IValoAccountInfo } from "../db/interfaces/IUser";
import { v1 as uuidv1 } from "uuid";

const baseUrl = "https://api.henrikdev.xyz";
export default class ValorantApi {
  private static instance: ValorantApi;

  private constructor() {}

  public static getInstatnce(): ValorantApi {
    if (!this.instance) {
      this.instance = new ValorantApi();
    }
    return this.instance;
  }

  async getUser(name: string, tag: string): Promise<any> {
    return new Promise(async (resolve, reject) => {
      const url = `${baseUrl}/valorant/v1/account/${encodeURIComponent(
        name
      )}/${encodeURIComponent(tag)}`;
      // console.log(url);
      axios
        .get(url)
        .then((response) => {
          // console.log(response.data);
          resolve(response.data);
        })
        .catch((error) => {
          return resolve(undefined);
        });
    });
  }

  async getEloByNameAndRegion(
    name: string,
    tag: string,
    region: string
  ): Promise<any> {
    return new Promise(async (resolve, reject) => {
      const newUrl = `${baseUrl}/valorant/v2/mmr/${region}/${encodeURIComponent(
        name
      )}/${encodeURIComponent(tag)}`;
      axios
        .get(newUrl)
        .then((response) => {
          resolve(response.data.data.current_data);
        })
        .catch((err) => {
          console.log(err);
          resolve(undefined);
        });
    });
  }

  async getEloByPuuidAndRegion(puuid: string, region: string): Promise<any> {
    return new Promise(async (resolve, reject) => {
      const url = `${baseUrl}/valorant/v1/by-puuid/mmr/${region}/${encodeURIComponent(
        puuid
      )}`;
      axios
        .get(url)
        .then((response) => {
          resolve(response.data.data);
        })
        .catch((err) => {
          console.log(err);
          resolve(undefined);
        });
    });
  }

  async linkUser(
    user: any,
    dbUser: IUser,
    force?: boolean
  ): Promise<[LinkUserResponseTypes, any]> {
    if (user) {
      let valoAccountInfo = dbUser[
        `${user.data.region}_account`
      ] as IValoAccountInfo;

      if (!valoAccountInfo) {
        valoAccountInfo = {} as IValoAccountInfo;
        dbUser[`${user.data.region}_account`] = valoAccountInfo;
        await dbUser.save();
        valoAccountInfo = dbUser[
          `${user.data.region}_account`
        ] as IValoAccountInfo;
      }

      if (valoAccountInfo.puuid && !force) {
        if (valoAccountInfo.puuid === user.data.puuid) {
          return [LinkUserResponseTypes.ALREADY_LINKED, user];
        }

        return [LinkUserResponseTypes.DIFFERENT_ACCOUNT_LINKED, user];
      } else {
        valoAccountInfo.puuid = user.data.puuid;

        const eloData = await this.getEloByPuuidAndRegion(
          user.data.puuid,
          user.data.region
        );

        if (eloData) {
          valoAccountInfo.elo = eloData.elo;
          valoAccountInfo.currenttier = eloData.currenttier;
          valoAccountInfo.currenttierpatched = eloData.currenttierpatched;
          valoAccountInfo.name = eloData.name;
          valoAccountInfo.tag = eloData.tag;
          // dbUser[`${user.data.region}_account`] = valoAccountInfo;
        } else {
          valoAccountInfo.elo = 0;
          valoAccountInfo.currenttier = 10;
          valoAccountInfo.currenttierpatched = "Estimated: Silver 2";
          valoAccountInfo.name = user.data.name;
          valoAccountInfo.tag = user.data.tag;
        }

        await dbUser.save();

        return [LinkUserResponseTypes.OK, user];
      }
    } else {
      return [LinkUserResponseTypes.NOT_FOUND, {}];
    }
  }

  async refreshUser(
    dbUser: IUser,
    region: string
  ): Promise<[RefreshUserResponseTypes, any]> {
    const valoAccountInfo = dbUser[`${region}_account`] as IValoAccountInfo;

    if (!valoAccountInfo || !valoAccountInfo.puuid) {
      return [RefreshUserResponseTypes.NOT_LINKED, undefined];
    }

    const data = await this.getEloByPuuidAndRegion(
      valoAccountInfo.puuid,
      region as string
    );
    if (!data) {
      return [RefreshUserResponseTypes.NO_ELO_FOUND, undefined];
    }

    valoAccountInfo.elo = data.elo;
    valoAccountInfo.currenttier = data.currenttier;
    valoAccountInfo.currenttierpatched = data.currenttierpatched;
    valoAccountInfo.name = data.name;
    valoAccountInfo.tag = data.tag;
    await dbUser.save();

    return [RefreshUserResponseTypes.OK, data];
  }
}

export enum LinkUserResponseTypes {
  OK,
  NOT_FOUND,
  DIFFERENT_ACCOUNT_LINKED,
  ALREADY_LINKED,
}

export enum RefreshUserResponseTypes {
  OK,
  NO_ELO_FOUND,
  NOT_LINKED,
}
