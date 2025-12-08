import type { Application } from "express";
import request from "supertest";

type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "DELETE"
  | "PATCH"
  | "HEAD"
  | "OPTIONS";

export interface LambdaLikeEvent {
  rawPath?: string;
  path?: string;
  routeKey?: string;
  rawQueryString?: string;
  queryStringParameters?: Record<string, string | undefined> | null;
  headers?: Record<string, string | undefined>;
  body?: string | null;
  isBase64Encoded?: boolean;
  requestContext?: { http?: { method?: HttpMethod } } & Record<string, unknown>;
  httpMethod?: HttpMethod;
}

export type LambdaLikeResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  isBase64Encoded: boolean;
};

const normalizeBody = (body?: string | null, isBase64Encoded?: boolean) => {
  if (!body) return undefined;
  if (isBase64Encoded) {
    return Buffer.from(body, "base64").toString("utf-8");
  }
  return body;
};

export function createServerlessHandler(app: Application) {
  return async function handler(event: LambdaLikeEvent): Promise<LambdaLikeResponse> {
    const method = (event.requestContext?.http?.method || event.httpMethod || "GET") as HttpMethod;
    const path = event.rawPath || event.path || "/";
    const body = normalizeBody(event.body, event.isBase64Encoded);
    const query = event.queryStringParameters || {};

    const httpRequest = request(app)[method.toLowerCase() as Lowercase<HttpMethod>](path).query(query);

    if (event.headers) {
      Object.entries(event.headers).forEach(([key, value]) => {
        if (value !== undefined) httpRequest.set(key, value);
      });
    }

    if (body) {
      httpRequest.send(body);
    }

    const response = await httpRequest;

    return {
      statusCode: response.status,
      headers: response.headers as Record<string, string>,
      body: response.text,
      isBase64Encoded: false,
    };
  };
}
