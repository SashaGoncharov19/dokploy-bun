import { vi } from "vitest";

/**
 * Installed via vitest's `setupFiles`. See ./db-mock.ts for why the mock exists
 * and for the bun-side counterpart.
 *
 * The factory is imported dynamically because `vi.mock` is hoisted above the
 * import statements, so a top-level binding would not be initialised yet.
 */
vi.mock("@dokploy/server/db", async () => {
	const { createDbMock } = await import("./db-mock");
	return createDbMock(vi.fn);
});

// The app's own db module is built on drizzle-orm/bun-sql, which imports the
// `bun` builtin. vitest runs under Node and cannot load it, so any suite whose
// imports reach a router would fail before its first assertion.
vi.mock("@/server/db", async () => {
	const { createDbMock } = await import("./db-mock");
	const { and, eq } = await import("drizzle-orm");
	return { ...createDbMock(vi.fn), and, eq };
});
