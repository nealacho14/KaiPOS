# Spec: Paso 11 — Monitoring, Logging y Alertas

| Field         | Value                                                                                  |
| ------------- | -------------------------------------------------------------------------------------- |
| Notion Ticket | [NT-33618b91](https://notion.so/33618b913fdd81deab13d5ba23e6cd0c)                      |
| Status        | In Progress                                                                            |
| Priority      | Media                                                                                  |
| Branch        | `NT-33618b91/monitoring-logging-alarms/feature`                                        |
| Created       | 2026-05-07                                                                             |

## Context

KaiPOS opera en AWS serverless (API Gateway HTTP + 4 Lambdas: 1 API + 3 WS) con MongoDB Atlas como base de datos externa. Necesitamos detectar y diagnosticar problemas en producción sin pasar las primeras horas de un incidente buscando logs a ciegas.

El backend ya emite logs JSON estructurados vía Pino con `requestId` correlacionable, y los log groups de CloudWatch tienen retención de 30 días. Lo que falta es:

1. Garantizar que los logs **no filtran secretos** (passwords, tokens, JWTs).
2. Que un humano se entere **por email** cuando algo se rompe — no por el reporte de un usuario.
3. Documentación que permita pasar de "suena la alarma" a "raíz del problema" en minutos.

Decisión clave: este paso queda dentro del **AWS Always Free Tier** (10 alarmas, 1k emails SNS/mes, 10 custom metrics) — costo $0/mes incremental. X-Ray, dashboards custom y métricas EMF se posponen hasta que haya tráfico real de clientes que justifique el gasto.

## Requirements

- Pino debe redactar campos sensibles (`password`, `passwordHash`, `token`, `refreshToken`, `accessToken`, `jwtSecret`, `authorization`, cookies) reemplazándolos por `[REDACTED]` antes de imprimir.
- El nivel de log de cada Lambda debe ser modificable vía variable de entorno `LOG_LEVEL` sin necesidad de redeploy (cambio desde la consola de Lambda).
- API Gateway HTTP debe emitir access logs en formato JSON estructurado con al menos `httpMethod`, `ip`, `protocol`, `requestTime`, `resourcePath`, `responseLength`, `status`, `user` y `requestId`.
- Existir 3 metric filters sobre los log groups que generen métricas para `MongoConnectionErrors`, `AuthFailures` y `SlowRequests` (>3s).
- Existir alarmas CloudWatch para: API 5xx > 5 en 5 min, API latencia p95 > 3s en 5 min, Lambda Errors > 3 en 5 min (por función), Lambda Throttles > 0 en 1 min (por función), `MongoConnectionErrors` > 5 en 5 min, `SlowRequests` > 10 en 5 min.
- Existir un SNS topic `kaipos-{stage}-alerts` con suscripción email, parametrizable vía `infra/lib/config.ts`.
- Cada alarma debe disparar acción al SNS topic (estado `ALARM` → email).
- Debe existir `docs/observability.md` con queries de Logs Insights y un runbook por alarma.
- Toda la configuración debe vivir en CDK; nada manual en consola más allá de confirmar la suscripción email.
- El cambio debe aplicarse a `dev` y `prod` (ambos stages, ambos correos pueden ser el mismo en MVP).
- La factura AWS de CloudWatch + SNS del mes siguiente al deploy debe seguir siendo $0.

## Acceptance Criteria

- [ ] Pegar un `requestId` cualquiera en CloudWatch Logs Insights devuelve todas las líneas (HTTP o WS) de ese request.
- [ ] Un test unitario en `apps/backend/src/lib/logger.test.ts` falla si un objeto con `password: 'foo'` se loguea en claro.
- [ ] Cambiar `LOG_LEVEL=debug` en la consola de la Lambda API eleva el verbosity inmediatamente (sin redeploy) y volver a `info` lo restaura.
- [ ] Forzar 6 errores 5xx consecutivos en un endpoint dispara la alarma `Api5xxHigh` y llega email en ≤ 6 minutos al destinatario configurado.
- [ ] Forzar un endpoint a tardar > 3s 11 veces en 5 min dispara la alarma `SlowRequests` y llega email.
- [ ] El servicio CloudWatch + SNS muestra **$0.00** en Cost Explorer 30 días después del deploy a `prod` (si excede, queda registrada la causa raíz).
- [ ] `docs/observability.md` contiene como mínimo: 4 queries de Logs Insights, un runbook por cada una de las 6 alarmas, y un link al monitoring nativo de Atlas.
- [ ] CDK `pnpm cdk synth` pasa sin warnings sobre el nuevo monitoring stack.

## Out of Scope

- **X-Ray distributed tracing** — costo $5/M traces; se agrega cuando haya tráfico real de clientes que justifique tener service map.
- **Dashboard CloudWatch custom** — $3/mes flat; mientras sea uno solo se usaría free tier, pero no aporta valor sobre la consola nativa de Metrics + Logs Insights en MVP.
- **Métricas EMF con dimensión `route`** — alta cardinalidad si se incluyen IDs en URLs; se evalúa cuando haya tráfico real.
- **Frontend RUM / Sentry / Web Vitals** — pertenece a un paso de observabilidad de cliente separado.
- **AWS Budgets / Cost Anomaly Detection** — paso de FinOps separado.
- **Synthetic canaries / health checks externos** — sobreingeniería para MVP sin clientes reales.
- **Atlas Performance Advisor / slow query alerts en Atlas** — se configuran en la consola de Atlas, no en CDK; el runbook puede mencionarlo como referencia pero no se automatiza aquí.
- **DLQ para Lambdas async** — el API actual es síncrono (HTTP request/response), no aplica.
- **Subsegmentos manuales de X-Ray alrededor de queries Mongo** — depende de tener X-Ray activado primero.

## Open Questions

- ¿El email destinatario de las alarmas es el correo personal del owner (`kelvin.hernandezc30@gmail.com`) tanto en `dev` como en `prod`, o queremos un alias diferente para `prod`? **Default propuesto:** mismo correo en ambos stages mientras dure el MVP — se puede separar fácilmente cambiando `config.ts` cuando haya equipo.
- ¿Las alarmas en `dev` deben silenciarse (no notificar email) para evitar ruido durante desarrollo, o queremos los 6 emails en ambos stages? **Default propuesto:** alarmas activas en ambos pero con umbrales más permisivos en `dev` (o suscripción email solo en `prod`); decidir al planear.
- ¿El metric filter de `MongoConnectionErrors` debe matchear también errores de timeout y de auth de Atlas, o solo failures de connection pool? Depende de qué patrones de log emite el driver `mongodb` en cada caso — verificar al planear con un grep en logs reales.
