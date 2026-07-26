import assert from "node:assert/strict";
import test from "node:test";
import { describeRedisConnection, getDefaultQueueOptions } from "./index";

const relevantKeys = [
  "NODE_ENV",
  "REDIS_URL",
  "REDIS_HOST",
  "REDIS_PORT",
  "REDIS_USERNAME",
  "REDIS_PASSWORD",
] as const;

function withRedisEnvironment(overrides: Partial<Record<(typeof relevantKeys)[number], string | undefined>>, run: () => void) {
  const before = Object.fromEntries(relevantKeys.map((key) => [key, process.env[key]]));
  try {
    for (const key of relevantKeys) {
      const value = overrides[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    run();
  } finally {
    for (const key of relevantKeys) {
      const value = before[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("production queue configuration requires authenticated TLS Redis", () => {
  withRedisEnvironment({ NODE_ENV: "production" }, () => {
    assert.throws(() => getDefaultQueueOptions(), /rediss:\/\//i);
  });

  withRedisEnvironment({ NODE_ENV: "production", REDIS_URL: "redis://user:password@cache.example:6379" }, () => {
    assert.throws(() => getDefaultQueueOptions(), /rediss/i);
  });

  withRedisEnvironment({ NODE_ENV: "production", REDIS_URL: "rediss://cache.example:6379" }, () => {
    assert.throws(() => getDefaultQueueOptions(), /authentication/i);
  });
});

test("queue configuration parses a production rediss URL without connecting", () => {
  withRedisEnvironment(
    { NODE_ENV: "production", REDIS_URL: "rediss://worker:secret@cache.example:6380" },
    () => {
      const options = getDefaultQueueOptions();
      const connection = options.connection as {
        host: string;
        port: number;
        username?: string;
        password?: string;
        tls?: object;
      };

      assert.equal(connection.host, "cache.example");
      assert.equal(connection.port, 6380);
      assert.equal(connection.username, "worker");
      assert.equal(connection.password, "secret");
      assert.ok(connection.tls);
      assert.deepEqual(describeRedisConnection(), {
        host: "cache.example",
        port: 6380,
        hasUsername: true,
        hasPassword: true,
        tls: true,
        source: "REDIS_URL",
      });
    },
  );
});
