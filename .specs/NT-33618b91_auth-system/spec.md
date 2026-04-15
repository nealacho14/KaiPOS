# Spec: Sistema de Autenticación

| Field         | Value                                                             |
| ------------- | ----------------------------------------------------------------- |
| Notion Ticket | [NT-33618b91](https://notion.so/33618b913fdd813f8ad2d281fd4a205e) |
| Status        | In Progress                                                       |
| Priority      | Alta                                                              |
| Branch        | `NT-33618b91/auth-system/feature`                                 |
| Created       | 2026-04-15                                                        |

## Context

KaiPOS necesita un sistema de autenticación para controlar el acceso a la plataforma. Actualmente el backend tiene el tipo `User` definido en `@kaipos/shared` con campos `businessId`, `email`, `passwordHash`, y `role` (admin | cashier | manager), y la colección `users` en MongoDB con índice único en `email` e índice compuesto en `businessId + role`. Sin embargo, no existe ningún código de autenticación: no hay endpoints de login/registro, no hay generación de tokens, ni middleware de protección de rutas.

El sistema de auth es prerequisito para cualquier funcionalidad que requiera identificar al usuario (órdenes, inventario, reportes). Los usuarios pertenecen a un negocio y pueden tener acceso a múltiples sucursales.

## Requirements

- **Registro de usuarios (solo admin)**: Un admin existente puede crear nuevos usuarios vinculados a su negocio. El primer admin se crea via seed/script de setup. No hay registro abierto.
- **Login con email/password**: Retorna un access token JWT + refresh token. El response incluye la lista de sucursales (`branchIds`) del usuario para que el frontend muestre un selector.
- **JWT claims**: El access token contiene `userId`, `businessId`, y `role`. No incluye `branchId` — las sucursales se validan per-request.
- **Multi-branch**: El tipo `User` se extiende con un campo `branchIds: string[]` que lista las sucursales a las que tiene acceso. Cada endpoint específico de sucursal recibe `branchId` como parámetro, y el middleware valida que el usuario tenga acceso a esa sucursal.
- **Refresh de tokens**: Endpoint para renovar un access token expirado usando un refresh token válido. Los refresh tokens se almacenan en MongoDB (nueva colección).
- **Logout**: Invalida el refresh token del usuario, impidiendo renovación de sesiones.
- **Recuperación de contraseña**: Endpoint para solicitar reset y endpoint para ejecutarlo con un token temporal. El envío real de email queda como placeholder (log del token en dev); la integración con AWS SES se hará en un ticket posterior.
- **Rate limiting en login**: Protección contra fuerza bruta. Bloqueo temporal de la cuenta tras 5 intentos fallidos consecutivos. Tracking de intentos en MongoDB (sin Redis, mantener costo ~$0).
- **Middleware de auth reutilizable**: Middleware de Hono que valida el JWT en rutas protegidas y expone los claims en el contexto del request. Middleware adicional para validar acceso a una sucursal específica.

## Acceptance Criteria

- [ ] Un admin puede registrar un nuevo usuario vinculado a su negocio
- [ ] Un usuario registrado puede hacer login con email/password y recibe tokens
- [ ] El access token JWT contiene claims: userId, businessId, role
- [ ] El response de login incluye la lista de branchIds del usuario
- [ ] Un access token expirado se renueva con el refresh token
- [ ] Después de logout, el refresh token anterior no es válido
- [ ] 5 intentos fallidos de login bloquean temporalmente la cuenta
- [ ] El endpoint de recuperación de contraseña genera un token temporal y lo loguea (placeholder para email)
- [ ] El endpoint de reset de contraseña con token válido actualiza el password
- [ ] Rutas protegidas rechazan requests sin token o con token inválido (401)
- [ ] El middleware de branch valida que el usuario tenga acceso a la sucursal solicitada (403)

## Out of Scope

- Registro abierto / self-service de negocios (el primer admin se crea via seed)
- Integración con AWS SES para envío real de emails (ticket aparte)
- OAuth / login con terceros (Google, Facebook, etc.)
- MFA / autenticación de dos factores
- Frontend de login (este ticket es solo backend)
- Permisos granulares por endpoint (RBAC fino) — por ahora solo se valida el rol genérico

## Open Questions

- Definir el tiempo exacto de bloqueo tras 5 intentos fallidos (sugerencia: 15 minutos)
- Definir TTL del access token (sugerencia: 15 minutos) y del refresh token (sugerencia: 7 días)
- Definir si el seed de setup debe actualizarse para incluir `branchIds` en los usuarios existentes y generar passwords hasheados reales
