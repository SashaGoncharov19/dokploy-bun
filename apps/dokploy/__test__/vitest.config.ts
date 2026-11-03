import { readdirSync } from "node:fs";
import path from "node:path";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";
import { BUN_DIRS, BUN_FILES, VITEST_ONLY } from "./runners";

const bunOwnedFiles = () =>
	[
		...BUN_DIRS.flatMap((dir) =>
			readdirSync(path.resolve(__dirname, "..", dir), { recursive: true })
				.map(String)
				.filter((file) => /\.test\.tsx?$/.test(file))
				.map((file) => `${dir}${file}`),
		),
		...BUN_FILES,
	].filter((file) => !VITEST_ONLY.includes(file));

export default defineConfig({
	test: {
		include: ["__test__/**/*.test.ts"], // Incluir solo los archivos de test en el directorio __test__
		// Everything bun test owns - see runners.ts, which both runners read.
		// Listed per file so the VITEST_ONLY suites inside bun directories stay here.
		exclude: [
			"**/node_modules/**",
			"**/dist/**",
			"**/.docker/**",
			...bunOwnedFiles().map((file) => `**/${file}`),
		],
		pool: "forks",
		setupFiles: [path.resolve(__dirname, "setup.ts")],
	},
	define: {
		"process.env": {
			NODE: "test",
			GITHUB_CLIENT_ID: "test",
			GITHUB_CLIENT_SECRET: "test",
			GOOGLE_CLIENT_ID: "test",
			GOOGLE_CLIENT_SECRET: "test",
		},
	},
	plugins: [
		tsconfigPaths({
			projects: [path.resolve(__dirname, "../tsconfig.json")],
		}),
	],
	resolve: {
		alias: {
			"@dokploy/server": path.resolve(
				__dirname,
				"../../../packages/server/src",
			),
		},
	},
});
