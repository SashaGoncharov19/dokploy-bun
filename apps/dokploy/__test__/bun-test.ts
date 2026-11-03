import { BUN_DIRS, BUN_FILES, VITEST_ONLY } from "./runners";

// bun test treats path arguments as substring filters, so each directory keeps
// its trailing slash: "__test__/logs" alone would also pick up logs-and-metrics.
const proc = Bun.spawn(
	[
		process.execPath,
		"test",
		...BUN_DIRS.map((dir) => `./${dir}`),
		...BUN_FILES.map((file) => `./${file}`),
		...VITEST_ONLY.map((file) => `--path-ignore-patterns=${file}`),
		...process.argv.slice(2),
	],
	{ cwd: `${import.meta.dir}/..`, stdio: ["inherit", "inherit", "inherit"] },
);

process.exit(await proc.exited);
