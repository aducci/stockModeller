// Errors as RFC 9457 problem+json (design/03-platform/api.md §1).
import type { Rejection } from "@connectome/model";

export type ProblemCode =
  "conflict" | "ruleViolation" | "forbidden" | "notFound" | "invalid" | "gone" | "unauthenticated";

export interface ProblemDetail {
  editIndex?: number;
  property?: string;
  rule?: string;
  message?: string;
  itemId?: string;
  changedBy?: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ProblemCode,
    readonly title: string,
    readonly details: ProblemDetail[] = [],
    /** The engine's reasons, when the engine rejected a change. */
    readonly reasons?: Rejection[],
  ) {
    super(title);
  }

  /** The error as a change rejection (for the live connection). */
  toRejections(): Rejection[] {
    if (this.reasons) return this.reasons;
    if (this.details.length === 0) return [{ code: "invalid", editIndex: 0, property: "", message: this.title }];
    return this.details.map((d) => ({
      code: "invalid",
      editIndex: d.editIndex ?? 0,
      property: d.property ?? "",
      message: d.message ?? this.title,
    }));
  }

  toProblem() {
    return { type: "about:blank", title: this.title, status: this.status, code: this.code, details: this.details };
  }
}

export const notFound = (what: string) => new ApiError(404, "notFound", `${what} not found`);
export const invalid = (message: string, details: ProblemDetail[] = []) =>
  new ApiError(422, "invalid", message, details);

const STATUS: Record<Rejection["code"], number> = {
  conflict: 409,
  gone: 409,
  ruleViolation: 422,
  invalid: 422,
  forbidden: 403,
};

const TITLE: Record<Rejection["code"], string> = {
  conflict: "Someone else changed this just now",
  gone: "The item was deleted meanwhile",
  ruleViolation: "The change breaks a rule",
  invalid: "The change is invalid",
  forbidden: "You may not make this change",
};

/** The engine's rejection of a change, as a problem. */
export function rejectionProblem(reasons: Rejection[]): ApiError {
  const first = reasons[0]!;
  const details = reasons.map((r): ProblemDetail => {
    switch (r.code) {
      case "conflict":
        return { editIndex: r.editIndex, property: r.property, changedBy: r.changedBy };
      case "gone":
        return { editIndex: r.editIndex, itemId: r.itemId };
      case "ruleViolation":
        return { editIndex: r.editIndex, rule: r.rule, message: r.message };
      case "forbidden":
        return { editIndex: r.editIndex, message: r.scope };
      case "invalid":
        return { editIndex: r.editIndex, property: r.property, message: r.message };
    }
  });
  return new ApiError(STATUS[first.code], first.code, TITLE[first.code], details, reasons);
}
