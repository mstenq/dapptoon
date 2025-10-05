import { type Transaction } from '@rocicorp/zero';
import type { Schema, Post } from '../prisma/generated/zero/schema';
import type { AuthData } from './auth';

export function createMutators(authData: AuthData | undefined) {
	return {
		post: {
			async create(tx: Transaction<Schema>, post: Post) {
				mustBeLoggedIn(authData);
				await tx.mutate.post.insert(post);
			},
			async delete(tx: Transaction<Schema>, id: string) {
				mustBeLoggedIn(authData);
				await tx.mutate.post.delete({ id });
			},
			async update(tx: Transaction<Schema>, post: Post) {
				mustBeLoggedIn(authData);
				await tx.mutate.post.update(post);
			},
		},
	};
}

function mustBeLoggedIn(authData: AuthData | undefined): AuthData {
	if (authData === undefined) {
		throw new Error('Must be logged in');
	}
	return authData;
}
