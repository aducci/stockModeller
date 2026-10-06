// Property values are JSONB (ADR-006), so their types are checked here: the change engine is the only writer.
import type { PropertyType, PropertyValue } from "@connectome/model";
import type { Metamodel } from "./metamodel";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const CURRENCY = /^[A-Z]{3}$/;

function isValidDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function decimals(n: number): number {
  if (Number.isInteger(n)) return 0;
  const text = n.toString();
  if (text.includes("e-")) return Number(text.split("e-")[1]);
  return text.split(".")[1]?.length ?? 0;
}

function checkNumber(pt: PropertyType, n: number): string | null {
  const v = pt.validation;
  if (!Number.isFinite(n)) return "must be a finite number";
  if (v?.min !== undefined && n < v.min) return `must be at least ${v.min}`;
  if (v?.max !== undefined && n > v.max) return `must be at most ${v.max}`;
  if (v?.decimals !== undefined && decimals(n) > v.decimals) {
    return v.decimals === 0 ? "must be a whole number" : `may have at most ${v.decimals} decimals`;
  }
  return null;
}

function checkText(pt: PropertyType, s: string): string | null {
  const v = pt.validation;
  if (v?.maxLength !== undefined && s.length > v.maxLength) return `must be at most ${v.maxLength} characters`;
  if (v?.pattern !== undefined && !new RegExp(v.pattern).test(s)) return `must match ${v.pattern}`;
  return null;
}

export interface ValueContext {
  metamodel: Metamodel;
  /** The type of a live object, or undefined if there is none (for objectRef properties). */
  objectTypeOf(id: string): string | undefined;
}

/** Checks a non-null value against its property type. Returns a message, or null when the value is valid. */
export function checkValue(pt: PropertyType, value: PropertyValue, ctx: ValueContext): string | null {
  switch (pt.dataType) {
    case "text":
    case "richText":
      return typeof value === "string" ? checkText(pt, value) : "must be text";
    case "url": {
      if (typeof value !== "string") return "must be a URL";
      try {
        const url = new URL(value);
        if (url.protocol !== "http:" && url.protocol !== "https:") return "must be an http or https URL";
      } catch {
        return "must be a URL";
      }
      return checkText(pt, value);
    }
    case "number":
      return typeof value === "number" ? checkNumber(pt, value) : "must be a number";
    case "money": {
      if (typeof value !== "object" || value === null || Array.isArray(value)) return "must be an amount and currency";
      if (!CURRENCY.test(value.currency)) return "must have a three-letter currency code";
      return checkNumber(pt, value.amount);
    }
    case "date":
      return typeof value === "string" && isValidDate(value) ? null : "must be a date (YYYY-MM-DD)";
    case "boolean":
      return typeof value === "boolean" ? null : "must be true or false";
    case "list":
    case "multiList": {
      const list = ctx.metamodel.valueList(pt.valueList ?? "");
      const allowed = new Set(list?.values.map((v) => v.key));
      const known = (v: string) => allowed.has(v);
      if (pt.dataType === "list") {
        return typeof value === "string" && known(value) ? null : `must be one of: ${[...allowed].join(", ")}`;
      }
      if (!Array.isArray(value)) return "must be a list of values";
      if (new Set(value).size !== value.length) return "must not repeat a value";
      const unknown = value.filter((v) => !known(v));
      return unknown.length === 0 ? null : `has unknown values: ${unknown.join(", ")}`;
    }
    case "objectRef": {
      if (typeof value !== "string") return "must be an object id";
      const type = ctx.objectTypeOf(value);
      if (!type) return "must refer to an existing object";
      const allowed = pt.objectTypes;
      if (allowed && allowed.length > 0 && !allowed.some((t) => ctx.metamodel.isA(type, t))) {
        return `must refer to an object of type ${allowed.join(" or ")}`;
      }
      return null;
    }
    case "person":
      return typeof value === "string" && value.trim().length > 0 ? null : "must be a person";
    case "calculated":
      return "is calculated and cannot be set";
  }
}
