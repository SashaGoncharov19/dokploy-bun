import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
	mock,
} from "bun:test";
import http from "node:http";
import type { AddressInfo } from "node:net";
import * as serverModule from "@dokploy/server";
import WebSocket from "ws";
import * as authorizeModule from "@/server/wss/authorize";
import * as ownershipModule from "@/server/wss/container-ownership";
import * as ptyModule from "@/server/wss/pty";

// Snapshot before mocking: mock.module is process-global under bun test.
const actual = {
	server: { ...serverModule },
	authorize: { ...authorizeModule },
	ownership: { ...ownershipModule },
	pty: { ...ptyModule },
};

// The fork runs the log stream through spawnPty (Bun.spawn with a terminal)
// rather than node-pty, so that is the seam to stub.
const mockSpawn = jest.fn();
const mockBelongs = jest.fn();

mock.module("@/server/wss/pty", () => ({ ...actual.pty, spawnPty: mockSpawn }));
mock.module("@dokploy/server", () => ({
	...actual.server,
	IS_CLOUD: false,
	findServerById: jest.fn(),
	validateRequest: jest.fn(async () => ({
		user: { id: "user-1" },
		session: { activeOrganizationId: "org-1" },
	})),
}));
mock.module("@/server/wss/authorize", () => ({
	...actual.authorize,
	canAccessDockerOverWss: jest.fn(async () => true),
}));
mock.module("@/server/wss/container-ownership", () => ({
	...actual.ownership,
	containerBelongsToService: mockBelongs,
}));

afterAll(() => {
	mock.module("@/server/wss/pty", () => actual.pty);
	mock.module("@dokploy/server", () => actual.server);
	mock.module("@/server/wss/authorize", () => actual.authorize);
	mock.module("@/server/wss/container-ownership", () => actual.ownership);
});

const { setupDockerContainerLogsWebSocketServer } = await import(
	"@/server/wss/docker-container-logs"
);

let server: http.Server;
let base: string;

beforeEach(async () => {
	jest.clearAllMocks();
	mockSpawn.mockReturnValue({
		onData: jest.fn(),
		kill: jest.fn(),
		write: jest.fn(),
	});
	server = http.createServer();
	setupDockerContainerLogsWebSocketServer(server);
	await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
	const { port } = server.address() as AddressInfo;
	base = `ws://127.0.0.1:${port}/docker-container-logs`;
});

afterEach(async () => {
	await new Promise((r) => server.close(r));
});

const closeCode = (query: string) =>
	new Promise<number | null>((resolve) => {
		const ws = new WebSocket(`${base}?${query}`);
		ws.once("close", (code) => resolve(code));
		setTimeout(() => {
			resolve(null);
			ws.close();
		}, 300);
	});

describe("docker container logs websocket", () => {
	it("denies a container outside the service", async () => {
		mockBelongs.mockResolvedValue(false);
		expect(
			await closeCode(
				"containerId=dokploy-postgres&runType=native&serviceId=svc-1",
			),
		).toBe(4003);
		expect(mockBelongs).toHaveBeenCalledWith(
			"svc-1",
			"dokploy-postgres",
			null,
			"native",
		);
		expect(mockSpawn).not.toHaveBeenCalled();
	});

	it("streams logs of a container of the service", async () => {
		mockBelongs.mockResolvedValue(true);
		expect(
			await closeCode("containerId=task1&runType=swarm&serviceId=svc-1"),
		).toBeNull();
		expect(mockSpawn).toHaveBeenCalled();
	});
});
