import { group } from "console";
import { Guild } from "discord.js";
import { Types } from "mongoose";
import DatabaseManager from "../db/DatabaseManager";
import IGuild, { IPremade, ITournamentSetting } from "../db/interfaces/IGuild";
import IUser from "../db/interfaces/IUser";
import TournamentMessage from "../TournamentMessage";

const dbManager = DatabaseManager.getInstance();

export default class TournamentManager {
  guild: Guild;
  tournament: ITournamentSetting;
  tournamentMessage: TournamentMessage;

  private _participantDbUsers: Map<string, IUser> = new Map();

  constructor(guild: Guild, tournament: ITournamentSetting) {
    this.guild = guild;
    this.tournament = tournament;
    this.tournamentMessage = new TournamentMessage(
      this.guild,
      this.tournament,
      this
    );
  }

  async getPremadeGroups(): Promise<PremadeParticipant[][]> {
    const populatedTournament = await this.populateTournament();

    const usersWhoDontWantPremade = populatedTournament.premades
      .filter((p) => !p.target)
      .map((p) => p.issuer);

    populatedTournament.premades = populatedTournament.premades.filter(
      (p) =>
        !usersWhoDontWantPremade.includes(p.issuer) &&
        !usersWhoDontWantPremade.includes(p.target)
    ) as Types.DocumentArray<IPremade>;

    const groups: PremadeParticipant[][] =
      this.getAllPremadeSelections(populatedTournament);
    // const groups: PremadeParticipant[][] = [
    //   [
    //     new PremadeParticipant({ id: "a" } as IUser),
    //     // new PremadeParticipant({ id: "b" } as IUser),
    //     new PremadeParticipant({ id: "c" } as IUser),
    //     new PremadeParticipant({ id: "h" } as IUser),
    //   ],
    //   [
    //     new PremadeParticipant({ id: "h" } as IUser),
    //     new PremadeParticipant({ id: "a" } as IUser),
    //   ],
    //   [
    //     new PremadeParticipant({ id: "c" } as IUser),
    //     new PremadeParticipant({ id: "b" } as IUser),
    //   ],
    //   [
    //     new PremadeParticipant({ id: "b" } as IUser),
    //     new PremadeParticipant({ id: "a" } as IUser),
    //   ],
    //   [
    //     new PremadeParticipant({ id: "d" } as IUser),
    //     new PremadeParticipant({ id: "e" } as IUser),
    //     new PremadeParticipant({ id: "f" } as IUser),
    //   ],
    //   [
    //     new PremadeParticipant({ id: "e" } as IUser),
    //     new PremadeParticipant({ id: "f" } as IUser),
    //     new PremadeParticipant({ id: "g" } as IUser),
    //     new PremadeParticipant({ id: "h" } as IUser),
    //     // new PremadeParticipant({ id: "i" } as IUser),
    //   ],
    // ];

    const combinedGroups = this.combineGroups(groups);
    combinedGroups.sort((a, b) => b.length - a.length);
    combinedGroups.forEach((g) => {
      g.sort((a, b) => a.status - b.status);
    });

    this.setStatusOfGroupMembers(combinedGroups, groups);

    return combinedGroups;
  }

  setStatusOfGroupMembers(
    combinedGroups: PremadeParticipant[][],
    selectedGroups: PremadeParticipant[][]
  ): void {
    for (const combinedGroup of combinedGroups) {
      for (const groupMember of combinedGroup) {
        const selectedGroup = selectedGroups.find(
          (g) => g[0].participant.id === groupMember.participant.id
        );

        if (selectedGroup) {
          const selectedGroupIncludedCount = selectedGroup.filter(
            (g) =>
              !!combinedGroup.find((c) => c.participant.id === g.participant.id)
          );

          if (selectedGroupIncludedCount.length === selectedGroup.length) {
            groupMember.status = PremadeStatus.READY;
          } else if (selectedGroupIncludedCount.length > 1) {
            groupMember.status = PremadeStatus.INCOMPLETE;
          } else {
            groupMember.status = PremadeStatus.CONFLICT;
          }
        } else {
          groupMember.status = PremadeStatus.PENDIG;
        }
      }
    }
  }

  combineGroups(groups: PremadeParticipant[][]): PremadeParticipant[][] {
    const result: PremadeParticipant[][] = groups.map((i) => [...i]);

    // combine groups with biggest intersection as long as there is one
    let biggestIntersection = this.getGroupsWithBiggestIntersection(result);

    while (biggestIntersection) {
      const mergedGroup = this.mergeTwoGroups(...biggestIntersection);

      result.splice(result.indexOf(biggestIntersection[0]), 1);
      result.splice(result.indexOf(biggestIntersection[1]), 1);
      result.push(mergedGroup);
      biggestIntersection = this.getGroupsWithBiggestIntersection(result);
    }

    return result;
  }

  getGroupsWithBiggestIntersection(
    groups: PremadeParticipant[][],
    maxGroupSize: number = 5
  ): [PremadeParticipant[], PremadeParticipant[]] | undefined {
    let result: [PremadeParticipant[], PremadeParticipant[]] = [
      undefined,
      undefined,
    ];
    let resultIntersectionLength = 0;
    for (const g1 of groups) {
      for (const g2 of groups) {
        if (g1 === g2) continue;
        const intersection = this.getGroupIntersection(g1, g2);
        if (
          intersection.length > resultIntersectionLength &&
          g1.length + g2.length - intersection.length <= maxGroupSize
        ) {
          result = [g1, g2];
          resultIntersectionLength = intersection.length;
        }
      }
    }
    if (resultIntersectionLength > 0) {
      return result;
    }
    return undefined;
  }

  getGroupIntersection(
    group1: PremadeParticipant[],
    group2: PremadeParticipant[]
  ): PremadeParticipant[] {
    const result: PremadeParticipant[] = [];
    for (const p of group1) {
      if (group2.find((g) => g.participant.id === p.participant.id)) {
        result.push(p);
      }
    }
    return result;
  }

  getAllPremadeSelections(
    populatedTournament: ITournamentSetting
  ): PremadeParticipant[][] {
    const groups: PremadeParticipant[][] = [];
    for (const premade of populatedTournament.premades) {
      let currentGroup =
        groups.find(
          (group) =>
            group.length > 0 && group[0].participant.id === premade.issuer.id
        ) || [];

      if (currentGroup.length === 0) {
        currentGroup.push(new PremadeParticipant(premade.issuer));
        groups.push(currentGroup);
      }

      if (!currentGroup.find((p) => p.participant.id === premade.target)) {
        currentGroup.push(new PremadeParticipant(premade.target));
      }
    }
    return groups;
  }

  async populateTournament(): Promise<ITournamentSetting> {
    return await new Promise((resolve, reject) => {
      this.tournament
        .ownerDocument()
        .populate(
          [
            { path: "tournamentSettings.participants" },
            { path: "tournamentSettings.premades.issuer" },
            { path: "tournamentSettings.premades.target" },
          ],
          (err, res) => {
            resolve((res as IGuild).tournamentSettings.id(this.tournament.id));
          }
        );
    });
  }

  mergeTwoGroups(
    group1: PremadeParticipant[],
    group2: PremadeParticipant[]
  ): PremadeParticipant[] {
    const result: PremadeParticipant[] = [];
    for (const p1 of group1.concat(group2)) {
      if (!result.find((e) => e.participant.id === p1.participant.id))
        result.push(p1);
    }
    return result;
  }

  groupIncludesGroup(
    group1: PremadeParticipant[],
    group2: PremadeParticipant[]
  ): boolean {
    if (group2.length > group1.length) return false;

    for (const participant2 of group2) {
      let participant2Found = false;
      for (const participant1 of group1) {
        if (participant1.participant.id === participant2.participant.id) {
          participant2Found = true;
          continue;
        }
      }
      if (!participant2Found) return false;
    }
    return true;
  }
}

class PremadeParticipant {
  participant: IUser;
  status: PremadeStatus;
  private id: string;

  constructor(participant: IUser) {
    this.participant = participant;
    this.status = PremadeStatus.CONFLICT;
    this.id = participant.id;
  }
}

export enum PremadeStatus {
  READY,
  PENDIG,
  INCOMPLETE,
  CONFLICT,
  DENIED,
}

export const PremateStatusEmoji = new Map<number, string>([
  [PremadeStatus.READY, ":green_circle: "],
  [PremadeStatus.PENDIG, ":blue_circle: "],
  [PremadeStatus.INCOMPLETE, ":yellow_circle: "],
  [PremadeStatus.CONFLICT, ":red_circle: "],
  [PremadeStatus.DENIED, ":purple_circle: "],
]);
