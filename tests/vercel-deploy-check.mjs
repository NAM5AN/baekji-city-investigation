import assert from "node:assert/strict";
import fs from "node:fs";
import { createAppServer } from "../server.mjs";

const config = JSON.parse(fs.readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
assert.equal(config.version, 2);
assert.ok(config.rewrites.some((rule) => rule.source === "/api/:path*"));
assert.ok(fs.existsSync(new URL("../api/index.mjs", import.meta.url)));
assert.equal(typeof createAppServer, "function");

const migration = fs.readFileSync(new URL("../supabase/migrations/0001_mvp_schema.sql", import.meta.url), "utf8");
assert.ok(!migration.includes("revoke all on all tables in schema public"));
assert.ok(migration.includes("alter table public.world_loops enable row level security"));
console.log("vercel-deploy-check: ok");
