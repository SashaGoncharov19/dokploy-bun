import { getAuditLogs } from "@dokploy/server/services/proprietary/audit-log";
import { z } from "zod";
import { createTRPCRouter, withPermission } from "../../trpc";

const MAX_EXPORT_ROWS = 10_000;

const auditLogFiltersSchema = z.object({
	userId: z.string().optional(),
	userEmail: z.string().optional(),
	resourceName: z.string().optional(),
	action: z
		.enum([
			"create",
			"update",
			"delete",
			"deploy",
			"cancel",
			"redeploy",
			"login",
			"logout",
			"download",
		])
		.optional(),
	resourceType: z
		.enum([
			"project",
			"service",
			"environment",
			"deployment",
			"user",
			"customRole",
			"domain",
			"certificate",
			"registry",
			"server",
			"sshKey",
			"gitProvider",
			"notification",
			"settings",
			"session",
		])
		.optional(),
	from: z.date().optional(),
	to: z.date().optional(),
});

export const auditLogRouter = createTRPCRouter({
	all: withPermission("auditLog", "read")
		.input(
			auditLogFiltersSchema.extend({
				limit: z.number().min(1).max(500).default(50),
				offset: z.number().min(0).default(0),
			}),
		)
		.query(async ({ ctx, input }) => {
			const result = await getAuditLogs({
				organizationId: ctx.session.activeOrganizationId,
				...input,
			});
			return { ...result, exportLimit: MAX_EXPORT_ROWS };
		}),
	export: withPermission("auditLog", "read")
		.input(auditLogFiltersSchema)
		.query(async ({ ctx, input }) => {
			return getAuditLogs({
				organizationId: ctx.session.activeOrganizationId,
				...input,
				limit: MAX_EXPORT_ROWS,
			});
		}),
});
