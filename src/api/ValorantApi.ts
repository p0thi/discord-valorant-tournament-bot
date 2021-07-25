import axios, { AxiosResponse } from "axios";

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
}
