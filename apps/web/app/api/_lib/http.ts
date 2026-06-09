/*
 * Flow: Provides shared API-route helpers.
 * 1. Normalize request/auth inputs.
 * 2. Expose small utilities used by server routes.
 * 3. Keep API handlers concise and consistent.
 */

import { NextResponse } from "next/server";

export const readJsonObject = async (
  request: Request
): Promise<Record<string, unknown>> => {
  const body = (await request.json().catch(() => ({}))) as unknown;

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {};
  }

  return body as Record<string, unknown>;
};

export const stringValue = (
  body: Record<string, unknown>,
  key: string
): string | undefined => {
  const value = body[key];
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export const stringArrayValue = (
  body: Record<string, unknown>,
  key: string
): string[] | undefined => {
  const value = body[key];
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter((item): item is string => typeof item === "string");
};

export const badRequest = (message: string) =>
  NextResponse.json({ error: message }, { status: 400 });

export const serverError = () =>
  NextResponse.json({ error: "Internal server error" }, { status: 500 });
