import type { ApprovalRequest, AuditRecord, ContextRef, HostBridge } from "core-agent";
import type { Logger } from "../logging/logger.js";

export function createDefaultHostBridge(logger: Logger): HostBridge {
  return {
    async resolveContext(refs: ContextRef[]) {
      return refs.map((ref: ContextRef) => ({
        kind: ref.kind,
        title: ref.title ?? ref.ref,
        content: `OneAgent host resolved ${ref.kind}:${ref.ref}`,
        priority: 10,
      }));
    },
    async requestApproval(request: ApprovalRequest) {
      const autoApprove = process.env.ONEAGENT_AUTO_APPROVE === "true";
      return {
        approved: autoApprove,
        reason: autoApprove
          ? "ONEAGENT_AUTO_APPROVE=true"
          : "Approval required — set ONEAGENT_AUTO_APPROVE=true for dev",
        approverId: "oneagent-host",
        metadata: request.metadata,
      };
    },
    async audit(record: AuditRecord) {
      logger.info("audit", {
        action: record.action,
        status: record.status,
        taskId: record.taskId,
        sessionId: record.sessionId,
      });
    },
  };
}

export function mergeHostBridge(base: HostBridge, override?: Partial<HostBridge>): HostBridge {
  if (!override) {
    return base;
  }
  return {
    resolveContext: override.resolveContext ?? base.resolveContext,
    requestApproval: override.requestApproval ?? base.requestApproval,
    redact: override.redact ?? base.redact,
    audit: override.audit ?? base.audit,
    onResult: override.onResult ?? base.onResult,
  };
}
