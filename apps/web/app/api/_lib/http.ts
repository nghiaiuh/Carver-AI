/*
 * Flow: Provides shared API-route helpers.
 * 1. Normalize request/auth inputs.
 * 2. Expose small utilities used by server routes.
 * 3. Keep API handlers concise and consistent.
 */

import { NextResponse } from "next/server";

export type ApiSuccess<T> = {
  success: true;
  data: T;
};

export type ApiFailure = {
  success: false;
  code: string;
  error: string;
  requestId: string;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

const REQUEST_ID_PATTERN = /^[a-zA-Z0-9._:-]{8,128}$/;

export const createRequestId = (request?: Request) => {
  const forwardedRequestId = request?.headers.get("x-request-id")?.trim();
  if (forwardedRequestId && REQUEST_ID_PATTERN.test(forwardedRequestId)) {
    return forwardedRequestId;
  }

  return crypto.randomUUID();
};

export const apiSuccess = <T>(data: T, init?: ResponseInit) =>
  NextResponse.json<ApiSuccess<T>>(
    {
      success: true,
      data,
    },
    init,
  );

export const apiFailure = (
  code: string,
  error: string,
  status: number,
  requestId: string,
) =>
  NextResponse.json<ApiFailure>(
    {
      success: false,
      code,
      error,
      requestId,
    },
    { status },
  );

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
  apiFailure("BAD_REQUEST", message, 400, createRequestId());

export const serverError = () =>
  apiFailure("INTERNAL_SERVER_ERROR", "Internal server error", 500, createRequestId());

export const badRequestResponse = (message: string, requestId: string) =>
  apiFailure("BAD_REQUEST", message, 400, requestId);

export const serverErrorResponse = (requestId: string) =>
  apiFailure("INTERNAL_SERVER_ERROR", "Internal server error", 500, requestId);
