import {
	ANYONE_CAN,
	createBuilder,
	definePermissions,
	type PermissionsConfig,
} from '@rocicorp/zero';
import { schema as generatedSchema, type Schema } from '../prisma/generated/zero/schema';
import type { AuthData } from './auth';

export const schema = generatedSchema;

export const permissions = definePermissions<AuthData, Schema>(
	generatedSchema,
	() =>
		({
			user: {
				row: {
					select: ANYONE_CAN,
				},
			},
			profile: {
				row: {
					select: ANYONE_CAN,
				},
			},
			post: {
				row: {
					select: ANYONE_CAN,
				},
			},
		}) satisfies PermissionsConfig<AuthData, Schema>,
);

export const builder = createBuilder(schema);
