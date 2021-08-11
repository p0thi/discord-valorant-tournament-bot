import {
  Client,
  Collection,
  EmbedField,
  GuildMember,
  Message,
  MessageEmbed,
  MessageOptions,
  Util,
} from "discord.js";
import DatabaseManager from "../db/DatabaseManager";
import { ITournamentSetting } from "../db/interfaces/IGuild";
import { IValoAccountInfo } from "../db/interfaces/IUser";
import TournamentMessageManager from "../managers/TournamentMessageManager";
import emojis from "../util/emojis";
import ITournamentMessage from "./ITournamentMessage";

const dbManager = DatabaseManager.getInstance();

export default class TournamentParticipantMessage
  implements ITournamentMessage
{
  async create(
    tournamentManager: TournamentMessageManager,
    populatedTournament: ITournamentSetting,
    messages: Message[],
    startId: number
  ): Promise<MessageOptions[]> {
    const participantMembers: Collection<string, GuildMember> =
      populatedTournament.participants.length > 0
        ? await tournamentManager.guild.members.fetch({
            user: populatedTournament.participants.map(
              (participant) => participant.discordId
            ),
          })
        : new Collection();

    const embeds: MessageEmbed[] = [];

    let fieldCounter = 1;
    for (const participant of populatedTournament.participants) {
      // for (const participant of Array(25).fill(
      //   populatedTournament.participants[0]
      // )) {
      if (embeds.length === 0) {
        embeds.push(
          new MessageEmbed({
            title: `${populatedTournament.name} - Participants 1`,
            description: `The paritcipants of the tournament.`,
            color: Util.resolveColor("#00e1ff"),
            fields: [],
          })
        );
      }
      let lastEmbed = embeds[embeds.length - 1];

      if (lastEmbed.fields.length === 0) {
        lastEmbed.fields.push({
          name: `Participants: ${fieldCounter++}`,
          value: "",
        } as EmbedField);
      }
      let lastField = lastEmbed.fields[lastEmbed.fields.length - 1];

      const [maxEloValoAccountInfo, region] =
        dbManager.getDbUserMaxElo(participant);
      const regionValoAccountInfo =
        participant[`${populatedTournament.region}_account`];
      const participantMention = `<@${participant.discordId}>`;
      const valoAccountInfoMention =
        region === populatedTournament.region
          ? `<:${
              emojis
                .find((e) => e?.tier === maxEloValoAccountInfo.currenttier)
                .getValoEmoji(tournamentManager.guild.client).identifier
            }>${maxEloValoAccountInfo.elo}`
          : `${region.toUpperCase()}: <:${
              emojis
                .find((e) => e?.tier === maxEloValoAccountInfo.currenttier)
                .getValoEmoji(tournamentManager.guild.client).identifier
            }>${
              maxEloValoAccountInfo.elo
            } | ${populatedTournament.region.toUpperCase()}: ${
              regionValoAccountInfo.elo
            }`;
      const nextMention = ` ${participantMention}(${valoAccountInfoMention})`;
      if (lastEmbed.length + nextMention.length > 6000) {
        const currentEmbedsCount = embeds.length;
        const newEmbed = new MessageEmbed({
          title: `${populatedTournament.name} - Participants ${
            currentEmbedsCount + 1
          }`,
          description: `The participants of the tournament.`,
          color: Util.resolveColor("#00e1ff"),
          fields: [],
        });
        // console.log(newEmbed.title);
        embeds.push(newEmbed);

        lastEmbed = embeds[embeds.length - 1];
        lastEmbed.fields.push({
          name: `Participants: ${fieldCounter++}`,
          value: "",
        } as EmbedField);
        lastField = lastEmbed.fields[lastEmbed.fields.length - 1];
      } else if (lastField.value.length + nextMention.length > 1024) {
        lastEmbed.fields.push({
          name: `Participants: ${fieldCounter++}`,
          value: "",
        } as EmbedField);

        lastField = lastEmbed.fields[lastEmbed.fields.length - 1];
      }

      lastField.value += nextMention;
    }

    // const embed1 = {
    //   title: `${populatedTournament.name} - Participants`,
    //   description: `The paritcipants of the tournament.`,
    //   color: "#00e1ff",
    //   fields: [
    //     {
    //       name: `Participants:`,
    //       value:
    //         populatedTournament.participants.length > 0
    //           ? "\n" +
    //             // participantMembers
    //             Array(15)
    //               .fill(participantMembers.first())
    //               .map((participant, index) => {
    //                 const user = populatedTournament.participants.find(
    //                   (p) => p.discordId === participant.id
    //                 );
    //                 const [maxEloValoAccountInfo, region] =
    //                   dbManager.getDbUserMaxElo(user);
    //                 const regionValoAccountInfo =
    //                   user[`${populatedTournament.region}_account`];
    //                 const participantMention = `<@${participant.id}>`;
    //                 const valoAccountInfoMention =
    //                   region === populatedTournament.region
    //                     ? `<:${
    //                         emojis
    //                           .find(
    //                             (e) =>
    //                               e?.tier === maxEloValoAccountInfo.currenttier
    //                           )
    //                           .getValoEmoji(tournamentManager.guild.client)
    //                           .identifier
    //                       }>${maxEloValoAccountInfo.elo}`
    //                     : `${region.toUpperCase()}: <:${
    //                         emojis
    //                           .find(
    //                             (e) =>
    //                               e?.tier === maxEloValoAccountInfo.currenttier
    //                           )
    //                           .getValoEmoji(tournamentManager.guild.client)
    //                           .identifier
    //                       }>${
    //                         maxEloValoAccountInfo.elo
    //                       } | ${populatedTournament.region.toUpperCase()}: ${
    //                         regionValoAccountInfo.elo
    //                       }`;
    //                 return ` ${participantMention}(${valoAccountInfoMention})`;
    //               })
    //               .join(", ")
    //           : "\u200b",
    //     },
    //   ],
    // };

    return embeds.map((embed) => ({
      content: undefined,
      embeds: [embed],
      components: [],
    }));
  }
}
