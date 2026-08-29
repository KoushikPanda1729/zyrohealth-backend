// DI symbols only — deliberately zero imports. container.ts imports and
// registers concrete providers against these; provider classes that need to
// inject a DIFFERENT provider (e.g. OpenAiProvider needing STORAGE_PROVIDER)
// must import the token from HERE, not from container.ts — importing it from
// container.ts creates a circular import (container.ts -> the provider ->
// container.ts) that resolves to `undefined` at class-decoration time under
// CommonJS, which tsyringe then reports as "Attempted to construct an
// undefined constructor" at boot, not a compile error.
export const AUTH_PROVIDER = Symbol('AUTH_PROVIDER');
export const AI_PROVIDER = Symbol('AI_PROVIDER');
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');
export const WHATSAPP_PROVIDER = Symbol('WHATSAPP_PROVIDER');
