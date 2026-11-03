import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	jest,
	mock,
	setSystemTime,
	spyOn,
	test,
} from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apiCreateBackup } from "@dokploy/server/db/schema";
import * as destinationService from "@dokploy/server/services/destination";
import { keepLatestNBackups } from "@dokploy/server/utils/backups";
import {
	getBackupFileName,
	normalizeS3Path,
} from "@dokploy/server/utils/backups/utils";
import { getRestoreCommand } from "@dokploy/server/utils/restore/utils";

// Snapshot before mocking: mock.module is process-global under bun test, so the
// real module goes back in afterAll.
const actualDestinationService = { ...destinationService };
const findDestinationByIdMock = jest.fn();

mock.module("@dokploy/server/services/destination", () => ({
	...actualDestinationService,
	findDestinationById: findDestinationByIdMock,
}));

afterAll(() => {
	mock.module(
		"@dokploy/server/services/destination",
		() => actualDestinationService,
	);
});

describe("normalizeS3Path", () => {
	test("should handle empty and whitespace-only prefix", () => {
		expect(normalizeS3Path("")).toBe("");
		expect(normalizeS3Path("/")).toBe("");
		expect(normalizeS3Path("  ")).toBe("");
		expect(normalizeS3Path("\t")).toBe("");
		expect(normalizeS3Path("\n")).toBe("");
		expect(normalizeS3Path(" \n \t ")).toBe("");
	});

	test("should trim whitespace from prefix", () => {
		expect(normalizeS3Path(" prefix")).toBe("prefix/");
		expect(normalizeS3Path("prefix ")).toBe("prefix/");
		expect(normalizeS3Path(" prefix ")).toBe("prefix/");
		expect(normalizeS3Path("\tprefix\t")).toBe("prefix/");
		expect(normalizeS3Path(" prefix/nested ")).toBe("prefix/nested/");
	});

	test("should remove leading slashes", () => {
		expect(normalizeS3Path("/prefix")).toBe("prefix/");
		expect(normalizeS3Path("///prefix")).toBe("prefix/");
	});

	test("should remove trailing slashes", () => {
		expect(normalizeS3Path("prefix/")).toBe("prefix/");
		expect(normalizeS3Path("prefix///")).toBe("prefix/");
	});

	test("should remove both leading and trailing slashes", () => {
		expect(normalizeS3Path("/prefix/")).toBe("prefix/");
		expect(normalizeS3Path("///prefix///")).toBe("prefix/");
	});

	test("should handle nested paths", () => {
		expect(normalizeS3Path("prefix/nested")).toBe("prefix/nested/");
		expect(normalizeS3Path("/prefix/nested/")).toBe("prefix/nested/");
		expect(normalizeS3Path("///prefix/nested///")).toBe("prefix/nested/");
	});

	test("should preserve middle slashes", () => {
		expect(normalizeS3Path("prefix/nested/deep")).toBe("prefix/nested/deep/");
		expect(normalizeS3Path("/prefix/nested/deep/")).toBe("prefix/nested/deep/");
	});

	test("should handle special characters", () => {
		expect(normalizeS3Path("prefix-with-dashes")).toBe("prefix-with-dashes/");
		expect(normalizeS3Path("prefix_with_underscores")).toBe(
			"prefix_with_underscores/",
		);
		expect(normalizeS3Path("prefix.with.dots")).toBe("prefix.with.dots/");
	});

	test("should handle the cases from the bug report", () => {
		expect(normalizeS3Path("instance-backups/")).toBe("instance-backups/");
		expect(normalizeS3Path("/instance-backups/")).toBe("instance-backups/");
		expect(normalizeS3Path("instance-backups")).toBe("instance-backups/");
	});
});

describe("customName", () => {
	const base = {
		destinationId: "dest-1",
		prefix: "/",
		database: "db",
		schedule: "0 0 * * *",
		backupType: "database" as const,
		databaseType: "postgres" as const,
	};

	test("rejects a name that starts with a hyphen", () => {
		expect(
			apiCreateBackup.safeParse({ ...base, customName: "-rf" }).success,
		).toBe(false);
	});

	test("accepts dots in the name", () => {
		expect(
			apiCreateBackup.safeParse({ ...base, customName: "daily.db" }).success,
		).toBe(true);
	});
});

describe("getBackupFileName", () => {
	beforeEach(() => {
		setSystemTime(new Date(Date.UTC(2026, 7, 4, 3, 27, 47, 369)));
	});

	afterEach(() => {
		setSystemTime();
	});

	test("timestamp only", () => {
		expect(getBackupFileName(undefined, "sql.gz")).toBe(
			"2026-08-04T03-27-47-369Z.sql.gz",
		);
	});

	test("custom name before the timestamp", () => {
		expect(getBackupFileName("my-backup", "sql.gz")).toBe(
			"my-backup-2026-08-04T03-27-47-369Z.sql.gz",
		);
	});

	test("fixed prefix, custom name and timestamp", () => {
		expect(getBackupFileName("dokploy-local", "zip", "webserver-backup")).toBe(
			"webserver-backup-dokploy-local-2026-08-04T03-27-47-369Z.zip",
		);
	});
});

describe("mongo restore", () => {
	test("strips only the trailing .gz", () => {
		const cmd = getRestoreCommand({
			appName: "app",
			type: "mongo",
			restoreType: "database",
			credentials: { database: "db" },
			rcloneCommand: "rclone copy src",
			backupFile: "app/db.gz-2026-08-04T03-27-47-369Z.bson.gz",
		});
		expect(cmd).toContain("< db.gz-2026-08-04T03-27-47-369Z.bson &&");
	});
});

describe("keepLatestNBackups", () => {
	let stubDir: string;
	let deletedFile: string;
	let originalPath: string | undefined;

	beforeEach(() => {
		stubDir = mkdtempSync(join(tmpdir(), "rclone-stub-"));
		deletedFile = join(stubDir, "deleted.txt");
		writeFileSync(
			join(stubDir, "rclone"),
			[
				"#!/bin/bash",
				'if [ "$1" = "lsf" ]; then',
				'  printf "%s\\n" "$@" | grep -qx -- "--use-server-modtime" || exit 1',
				'  printf "%s\\n" "$@" | grep -qx "tp" || exit 1',
				'  echo "2026-08-04 03:27:00;2026-08-04T03-27-00-000Z.sql.gz"',
				'  echo "2026-08-04 03:28:00;dokploy-local-2026-08-04T03-28-00-000Z.sql.gz"',
				'  echo "2026-08-04 03:29:00;2026-08-04T03-29-00-000Z.sql.gz"',
				'  echo "2026-08-04 03:30:00;dokploy-local-2026-08-04T03-30-00-000Z.sql.gz"',
				'elif [ "$1" = "delete" ]; then',
				`  echo "\${@: -1}" >> "${deletedFile}"`,
				"fi",
			].join("\n"),
			{ mode: 0o755 },
		);
		originalPath = process.env.PATH;
		process.env.PATH = `${stubDir}:${originalPath ?? ""}`;
		findDestinationByIdMock.mockResolvedValue({
			bucket: "test-bucket",
			accessKey: "AK",
			secretAccessKey: "SK",
			region: "us-east-1",
			endpoint: "https://s3.example.com",
		});
	});

	afterEach(() => {
		process.env.PATH = originalPath;
		rmSync(stubDir, { recursive: true, force: true });
	});

	test("deletes the oldest by modtime, not by name", async () => {
		const consoleErrorSpy = spyOn(console, "error").mockImplementation(
			() => {},
		);
		await keepLatestNBackups({
			backupId: "backup-1",
			destinationId: "dest-1",
			prefix: "/",
			appName: "test-app",
			databaseType: "postgres",
			keepLatestCount: 2,
		} as never);
		expect(consoleErrorSpy).not.toHaveBeenCalled();
		consoleErrorSpy.mockRestore();

		const deleted = readFileSync(deletedFile, "utf-8")
			.trim()
			.split("\n")
			.map((path) => path.split("/").at(-1))
			.sort();
		expect(deleted).toEqual([
			"2026-08-04T03-27-00-000Z.sql.gz",
			"dokploy-local-2026-08-04T03-28-00-000Z.sql.gz",
		]);
	});
});
