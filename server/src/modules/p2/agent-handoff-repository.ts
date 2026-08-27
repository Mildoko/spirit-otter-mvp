import type { AgentHandoff, Prisma, PrismaClient } from "@prisma/client";
import type { AgentHandoffProposalV1 } from "@otter/shared";
import { RECORD_DAYS } from "../../config/constants.js";
import { addDays } from "../../utils.js";
import {
  transitionAgentHandoffXState,
  type AgentHandoffMachineEvent,
  type AgentHandoffStateV1,
} from "../../state-machines/agent-handoff-machine.js";
import { getPublicPortalItemV01 } from "../community/public-catalog.js";
import { parseAgentHandoffProposal } from "./data-contract.js";

type DbClient = PrismaClient | Prisma.TransactionClient;

function notFound(code: string, message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404, code });
}

function conflict(code: string, message: string): Error {
  return Object.assign(new Error(message), { statusCode: 409, code });
}

function proposalFromRow(row: AgentHandoff): AgentHandoffProposalV1 {
  return parseAgentHandoffProposal({
    schemaVersion: 1,
    id: row.id,
    status: "proposed",
    fromAgentId: row.fromAgentId,
    toAgentId: row.toAgentId,
    initiatedBy: row.initiatedBy,
    reason: row.reason,
    context: {
      focus: row.focus,
      publicItemId: row.publicItemId,
      actionId: row.actionId,
      followupId: row.followupId,
    },
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.proposalExpiresAt.toISOString(),
  });
}

async function assertOwnedReferences(db: DbClient, input: {
  conversationId: string;
  proposal: AgentHandoffProposalV1;
}): Promise<void> {
  const { actionId, followupId, publicItemId } = input.proposal.context;
  if (actionId && !await db.actionItem.findFirst({ where: { id: actionId, conversationId: input.conversationId }, select: { id: true } })) {
    throw notFound("HANDOFF_ACTION_NOT_FOUND", "交接引用的行动不存在于当前会话");
  }
  if (followupId && !await db.followupTask.findFirst({ where: { id: followupId, conversationId: input.conversationId }, select: { id: true } })) {
    throw notFound("HANDOFF_FOLLOWUP_NOT_FOUND", "交接引用的回访不存在于当前会话");
  }
  if (publicItemId && !getPublicPortalItemV01(publicItemId)) {
    throw notFound("HANDOFF_PUBLIC_ITEM_NOT_FOUND", "交接引用的公共内容不存在");
  }
}

export async function persistAgentHandoffProposal(db: DbClient, input: {
  userId: string;
  conversationId: string;
  proposal: AgentHandoffProposalV1;
  now?: Date;
}): Promise<AgentHandoff> {
  const proposal = parseAgentHandoffProposal(input.proposal);
  const now = input.now ?? new Date();
  if (Date.parse(proposal.expiresAt) <= now.getTime()) throw conflict("HANDOFF_PROPOSAL_EXPIRED", "不能保存已经过期的交接提议");
  const conversation = await db.conversation.findFirst({ where: { id: input.conversationId, userId: input.userId }, select: { id: true, activeAgentId: true } });
  if (!conversation) throw notFound("HANDOFF_CONVERSATION_NOT_FOUND", "交接会话不存在");
  if (conversation.activeAgentId !== proposal.fromAgentId) throw conflict("HANDOFF_SOURCE_NOT_ACTIVE", "交接来源不是当前 Agent");
  await assertOwnedReferences(db, { conversationId: input.conversationId, proposal });
  return db.agentHandoff.create({
    data: {
      id: proposal.id,
      userId: input.userId,
      conversationId: input.conversationId,
      fromAgentId: proposal.fromAgentId,
      toAgentId: proposal.toAgentId,
      initiatedBy: proposal.initiatedBy,
      reason: proposal.reason,
      focus: proposal.context.focus,
      publicItemId: proposal.context.publicItemId,
      actionId: proposal.context.actionId,
      followupId: proposal.context.followupId,
      proposalExpiresAt: new Date(proposal.expiresAt),
      expiresAt: new Date(proposal.expiresAt),
      schemaVersion: proposal.schemaVersion,
      createdAt: new Date(proposal.createdAt),
    },
  });
}

export async function findAgentHandoffForUser(db: DbClient, userId: string, id: string): Promise<AgentHandoff | null> {
  return db.agentHandoff.findFirst({ where: { id, userId } });
}

export async function transitionPersistedAgentHandoff(db: PrismaClient, input: {
  userId: string;
  id: string;
  event: AgentHandoffMachineEvent;
}): Promise<{
  record: AgentHandoff | null;
  accepted: boolean;
  authorityChange: ReturnType<typeof transitionAgentHandoffXState>["authorityChange"];
}> {
  return db.$transaction(async (tx) => {
    const row = await tx.agentHandoff.findFirst({ where: { id: input.id, userId: input.userId } });
    if (!row) throw notFound("HANDOFF_NOT_FOUND", "交接记录不存在");
    const result = transitionAgentHandoffXState({
      snapshot: { state: row.status as AgentHandoffStateV1, authorizedAt: row.authorizedAt?.toISOString() ?? null },
      proposal: proposalFromRow(row),
      event: input.event,
    });
    if (!result.accepted) return { record: row, accepted: false, authorityChange: null };

    if (["rejected", "expired", "safety_interrupted"].includes(result.snapshot.state)) {
      const deleted = await tx.agentHandoff.deleteMany({ where: { id: row.id, userId: input.userId, status: row.status } });
      if (deleted.count !== 1) throw conflict("HANDOFF_CONCURRENT_UPDATE", "交接状态已被其他请求更新");
      return { record: null, accepted: true, authorityChange: null };
    }

    const occurredAt = new Date(input.event.occurredAt);
    const updated = await tx.agentHandoff.updateMany({
      where: { id: row.id, userId: input.userId, status: row.status },
      data: result.snapshot.state === "authorized"
        ? { status: "authorized", authorization: "explicit_user_confirm", authorizedAt: occurredAt, expiresAt: addDays(occurredAt, RECORD_DAYS) }
        : { status: "completed", completedAt: occurredAt },
    });
    if (updated.count !== 1) throw conflict("HANDOFF_CONCURRENT_UPDATE", "交接状态已被其他请求更新");
    const record = await tx.agentHandoff.findUniqueOrThrow({ where: { id: row.id } });
    return { record, accepted: true, authorityChange: result.authorityChange };
  });
}

export async function cleanupExpiredAgentHandoffs(db: DbClient, now = new Date()): Promise<number> {
  const deleted = await db.agentHandoff.deleteMany({
    where: {
      OR: [
        { expiresAt: { lte: now } },
        { status: { in: ["proposed", "authorized"] }, proposalExpiresAt: { lte: now } },
      ],
    },
  });
  return deleted.count;
}
