/*
 * Common type aliases used across the frontend codebase.
 * Allows IDs to be either numeric database IDs or slug strings.
 */

export type Id = number | string;
export type NullableId = Id | null;
export type OptionalId = Id | undefined;
