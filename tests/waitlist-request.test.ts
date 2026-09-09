import { describe, expect, test } from "bun:test";
import {
  InvalidJsonBodyError,
  readJsonObject,
  RequestBodyTooLargeError,
  UnsupportedContentTypeError,
} from "../lib/waitlist/request";

describe("waitlist JSON requests", () => {
  test("accepts a small JSON object", async () => {
    const request = new Request("https://uselatch.app/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ email: "person@example.com" }),
    });

    await expect(readJsonObject(request)).resolves.toEqual({ email: "person@example.com" });
  });

  test("rejects a non-JSON content type", async () => {
    const request = new Request("https://uselatch.app/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "person@example.com",
    });

    await expect(readJsonObject(request)).rejects.toBeInstanceOf(UnsupportedContentTypeError);
  });

  test("rejects malformed JSON", async () => {
    const request = new Request("https://uselatch.app/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    await expect(readJsonObject(request)).rejects.toBeInstanceOf(InvalidJsonBodyError);
  });

  test("rejects a body larger than 1 KiB", async () => {
    const request = new Request("https://uselatch.app/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `${"a".repeat(1_024)}@example.com` }),
    });

    await expect(readJsonObject(request)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
  });
});
