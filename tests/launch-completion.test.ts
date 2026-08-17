import { describe, expect, it } from "vitest";
import {
  evaluateLaunchCompletion,
  pilotTaskDefinitions,
  type LaunchCompletionSnapshot,
} from "~/lib/launch-completion";

const readySnapshot: LaunchCompletionSnapshot = {
  publishedProjects: 3,
  publishedOpportunities: 2,
  publishedCampaigns: 1,
  upcomingEvents: 2,
  approvedFounders: 3,
  approvedCreators: 8,
  approvedInvestors: 3,
  multiRoleMembers: 1,
  pilotParticipants: 14,
  completedParticipants: 10,
  pilotFounders: 3,
  pilotCreators: 8,
  pilotInvestors: 3,
  pilotMultiRole: 1,
  passedTaskKeys: [
    "membership_auth",
    "profile_privacy",
    "founder_project",
    "creator_campaign",
    "investor_deal",
    "account_recovery",
  ],
  openCriticalOrHighFindings: 0,
};

describe("AKARI House launch completion", () => {
  it("does not call an empty or synthetic House ready", () => {
    const result = evaluateLaunchCompletion({
      ...readySnapshot,
      publishedProjects: 0,
      pilotParticipants: 0,
      completedParticipants: 0,
      passedTaskKeys: [],
    });
    expect(result.seedReady).toBe(false);
    expect(result.cohortReady).toBe(false);
    expect(result.journeysReady).toBe(false);
    expect(result.readyForPublicV1).toBe(false);
  });

  it("requires balanced real-user coverage and resolved serious defects", () => {
    const result = evaluateLaunchCompletion({
      ...readySnapshot,
      pilotCreators: 7,
      openCriticalOrHighFindings: 1,
    });
    expect(result.cohortReady).toBe(false);
    expect(result.defectsClear).toBe(false);
    expect(result.readyForPublicV1).toBe(false);
  });

  it("marks V1 ready only when seed, cohort, journeys and defects are clear", () => {
    const result = evaluateLaunchCompletion(readySnapshot);
    expect(result.seedReady).toBe(true);
    expect(result.cohortReady).toBe(true);
    expect(result.journeysReady).toBe(true);
    expect(result.defectsClear).toBe(true);
    expect(result.readyForPublicV1).toBe(true);
  });

  it("keeps the pilot journey catalogue bounded to real product tasks", () => {
    expect(pilotTaskDefinitions.map((task) => task.key)).toEqual([
      "membership_auth",
      "profile_privacy",
      "connections",
      "founder_project",
      "creator_campaign",
      "investor_deal",
      "event_participation",
      "account_recovery",
    ]);
  });
});
