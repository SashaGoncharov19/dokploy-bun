/**
 * Which test runner owns which file. bun-test.ts and vitest.config.ts both read
 * this, so the two sets are complementary by construction: a file is either
 * under a bun directory or file and not listed in VITEST_ONLY, or vitest runs it.
 *
 * Porting a directory or file means adding it to BUN_DIRS or BUN_FILES and
 * rewriting its imports to bun:test, so the runner stays visible in the file.
 */

export const BUN_DIRS = [
	"__test__/logs/",
	"__test__/registry/",
	"__test__/requests/",
	"__test__/api/",
	"__test__/cluster/",
	"__test__/templates/",
	"__test__/backups/",
	"__test__/services/",
	"__test__/queues/",
	"__test__/drop/",
	"__test__/traefik/",
	"__test__/server/",
	"__test__/permissions/",
	"__test__/wss/",
	"__test__/dns/",
	"__test__/compose/",
	"__test__/git-provider/",
	"__test__/deploy/",
];

// utils is split per file: remote-stream stays on vitest because when a
// piped-child test's promise never settles, `bun test` spins at 100% CPU
// instead of timing it out (Bun 1.3.11, 1.3.14 and 1.4.2 alike), so a
// regression would hang CI rather than fail it. vitest fails it in 5s.
export const BUN_FILES = [
	"__test__/utils/backups.test.ts",
	"__test__/utils/hostname-validation.test.ts",
	"__test__/utils/log-type.test.ts",
];

// Suites upstream added inside directories this fork runs on bun test. They are
// still written against vitest (vi.hoisted, importOriginal, vi.resetModules,
// fake timers), so vitest keeps them until each one is ported.
export const VITEST_ONLY = [
	"__test__/api/update-server.test.ts",
	"__test__/backups/backup-destination-organization.test.ts",
	"__test__/backups/backup-files.test.ts",
	"__test__/backups/init-cron-jobs.test.ts",
	"__test__/backups/run-backup-destination-organization.test.ts",
	"__test__/backups/volume-backup-destination-organization.test.ts",
	"__test__/backups/volume-backup-tar-exit.test.ts",
	"__test__/compose/branch-validation.test.ts",
	"__test__/compose/delete-schema.test.ts",
	"__test__/compose/domain/merge-key.test.ts",
	"__test__/compose/file-mounts.test.ts",
	"__test__/compose/provider-status.test.ts",
	"__test__/deploy/bitbucket-watch-paths.test.ts",
	"__test__/deploy/deploy-error-log.test.ts",
	"__test__/deploy/preview-build-server.test.ts",
	"__test__/deploy/refresh-token-handler.test.ts",
	"__test__/git-provider/clone-token-header.test.ts",
	"__test__/git-provider/gitlab-refresh-token.test.ts",
	"__test__/logs/container-logs-search.test.ts",
	"__test__/permissions/cross-org-scope.test.ts",
	"__test__/registry/docker-login.test.ts",
	"__test__/requests/read-monitoring-config.test.ts",
	"__test__/server/server-traefik-config.test.ts",
	"__test__/traefik/concurrent-domains.test.ts",
	"__test__/traefik/standalone-traefik-recreate.test.ts",
	"__test__/traefik/traefik-files-server-organization.test.ts",
	"__test__/traefik/traefik-version.test.ts",
	"__test__/traefik/update-traefik-cloud.test.ts",
	"__test__/traefik/update-traefik-router.test.ts",
	"__test__/wss/container-ownership.test.ts",
	"__test__/wss/docker-stats.test.ts",
	"__test__/wss/listen-deployment.test.ts",
];
