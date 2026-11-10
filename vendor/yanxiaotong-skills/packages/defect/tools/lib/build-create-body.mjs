/**
 * 创建 body 组装
 */
import { descriptionForApiStorage } from './description-format.mjs';

export function buildCreateBody(prepared) {
  const body = {
    title: prepared.title,
    requirementId: String(prepared.requirementId),
  };
  if (prepared.description) {
    body.description = descriptionForApiStorage(prepared.description);
  }
  if (prepared.severity) body.severity = prepared.severity;
  if (prepared.discoveryPhase) body.discoveryPhase = prepared.discoveryPhase;
  if (prepared.assigneeId) body.assigneeId = String(prepared.assigneeId);
  if (prepared.assigneeName) body.assigneeName = String(prepared.assigneeName);
  if (prepared.defectType) body.defectType = String(prepared.defectType);
  if (prepared.regressionTesterId) {
    body.regressionTesterId = String(prepared.regressionTesterId);
  }
  if (prepared.regressionTesterName) {
    body.regressionTesterName = String(prepared.regressionTesterName);
  }
  return body;
}
