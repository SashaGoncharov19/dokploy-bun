import {
	afterAll,
	beforeEach,
	describe,
	expect,
	it,
	jest,
	mock,
} from "bun:test";
import { exec } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import * as constantsModule from "@dokploy/server/constants";
import * as dbModule from "@dokploy/server/db";
import * as applicationModule from "@dokploy/server/services/application";
import * as composeModule from "@dokploy/server/services/compose";
import { generateApplyPatchesCommand } from "@dokploy/server/services/patch";

const execAsync = promisify(exec);

// Snapshot before mocking: mock.module is process-global under bun test, so
// every module goes back in afterAll, and the stand-ins keep the rest of each
// module's exports for whatever else imports it meanwhile.
const actual = {
	constants: { ...constantsModule },
	db: { ...dbModule },
	application: { ...applicationModule },
	compose: { ...composeModule },
};

const mocks = {
	findApplicationById: jest.fn(),
	findComposeById: jest.fn(),
	paths: jest.fn(),
	findMany: jest.fn(),
};

mock.module("@dokploy/server/services/application", () => ({
	...actual.application,
	findApplicationById: mocks.findApplicationById,
}));

mock.module("@dokploy/server/services/compose", () => ({
	...actual.compose,
	findComposeById: mocks.findComposeById,
}));

mock.module("@dokploy/server/constants", () => ({
	...actual.constants,
	paths: mocks.paths,
}));

mock.module("@dokploy/server/db", () => ({
	...actual.db,
	db: { query: { patch: { findMany: mocks.findMany } } },
}));

const baseDir = mkdtempSync(join(tmpdir(), "patch-poc-"));

beforeEach(() => {
	jest.clearAllMocks();
	mocks.findApplicationById.mockResolvedValue({ appName: "demo-app" });
	mocks.paths.mockReturnValue({
		APPLICATIONS_PATH: baseDir,
		COMPOSE_PATH: baseDir,
	});
});

afterAll(() => {
	rmSync(baseDir, { recursive: true, force: true });
	mock.module("@dokploy/server/services/application", () => actual.application);
	mock.module("@dokploy/server/services/compose", () => actual.compose);
	mock.module("@dokploy/server/constants", () => actual.constants);
	mock.module("@dokploy/server/db", () => actual.db);
});

const run = (id: string) =>
	generateApplyPatchesCommand({ id, type: "application", serverId: null });

describe("generateApplyPatchesCommand hardening", () => {
	it("neutralizes command substitution in a create patch filePath", async () => {
		const marker = join(baseDir, "PWNED_CREATE");
		mocks.findMany.mockResolvedValue([
			{
				enabled: true,
				type: "create",
				filePath: ` z$(touch ${marker})`,
				content: "x",
			},
		]);

		const command = await run("app1");
		await execAsync(`(${command}) 2>&1 || true`);
		await expect(
			execAsync(`test -e ${JSON.stringify(marker)}`),
		).rejects.toBeTruthy();
	});

	it("neutralizes command substitution in a delete patch filePath", async () => {
		const marker = join(baseDir, "PWNED_DELETE");
		mocks.findMany.mockResolvedValue([
			{
				enabled: true,
				type: "delete",
				filePath: ` z$(touch ${marker})`,
				content: "",
			},
		]);

		const command = await run("app2");
		await execAsync(`(${command}) 2>&1 || true`);
		await expect(
			execAsync(`test -e ${JSON.stringify(marker)}`),
		).rejects.toBeTruthy();
	});

	it("rejects a path that traverses outside the code directory", async () => {
		mocks.findMany.mockResolvedValue([
			{
				enabled: true,
				type: "create",
				filePath: "../../../../../../../../tmp/dokploy-escape",
				content: "x",
			},
		]);

		await expect(run("app3")).rejects.toThrow(/escapes the code directory/);
	});
});
