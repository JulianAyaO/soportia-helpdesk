# Automatizaciones de Soportia

n8n es un orquestador externo. PostgreSQL y Spring Boot siguen siendo la fuente de
verdad para tickets, permisos, prioridad y SLA.

## Carpetas

```text
automation/
├── README.md                 # este contrato
├── generate-workflows.py     # regenera los JSON (opcional)
└── workflows/                # importar en n8n; sin secretos
    ├── auto-route-ticket.json
    ├── sla-alert.json
    └── waiting-reminder.json
```

Compose monta `automation/workflows` en `/workflows` (solo lectura).

## Desarrollo local

1. Levanta el stack con `docker compose up --build`.
2. Abre `http://localhost:5678` y crea el usuario propietario local de n8n.
3. Importa los JSON de `automation/workflows` desde la interfaz, o una sola vez
   mediante `docker compose exec n8n n8n import:workflow --separate --input=/workflows`.
4. Comprueba las variables del servicio n8n:
   - `SOPORTIA_API_URL` (`http://backend:8080/api/v1`)
   - `SOPORTIA_HMAC_SECRET` (el mismo `N8N_HMAC_SECRET` del backend)
   - `SOPORTIA_SLA_WAIT_SECONDS` (15 en local para la demo; 900 = 15 min reales)
   - `SOPORTIA_WAITING_HOURS` (por defecto 2)
5. n8n 2 bloquea `$env` en nodos Code salvo que `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`.
6. Publica los tres workflows. Si cambias los JSON, vuelve a importarlos (la copia
   de n8n no se actualiza sola) y publícalos de nuevo. Si queda una copia vieja
   con el mismo path de webhook, desactívala primero. Los webhooks deben tener
   **Raw Body** activo: la firma HMAC se calcula sobre el cuerpo exacto que envía
   el backend, no sobre un JSON re-serializado.

El backend persiste primero cada evento en su outbox. Si n8n no está disponible,
el ticket continúa funcionando y la entrega se reintenta. No apuntes n8n
directamente a las tablas de Soportia.

## Workflows

| Workflow | Disparo | Qué hace |
| --- | --- | --- |
| Auto route ticket | `ticket.created` | GET agentes del equipo, asigna al de menor cola y, si el texto habla de contraseña/VPN/correo, publica una respuesta guiada. El ticket sigue `OPEN`. |
| SLA alert | `ticket.sla.at_risk` / `ticket.sla.breached` | En at_risk espera `SOPORTIA_SLA_WAIT_SECONDS`, GET del ticket; si sigue `OPEN`, sube prioridad, avisa al admin y reasigna. Si ya lo tomaron (`IN_PROGRESS` u otro estado), no muta. |
| Waiting reminder | cron cada hora | GET tickets en `WAITING_FOR_REQUESTER` con más de X horas y deja comentario + notificación al empleado. |

Para regenerar los JSON después de un cambio de plantilla: `python automation/generate-workflows.py`. El secreto HMAC no se escribe en esos archivos.

## Contrato HMAC

Los eventos contienen `eventId`, `eventType`, `eventVersion`, `occurredAt` y
`payload`. Los callbacks POST firman `timestamp + "." + body` con HMAC-SHA256
(`sha256=` + hex) y llevan `X-Idempotency-Key`.

Los GET que n8n hace a Spring firman el canónico
`METHOD + " " + URI + opcional ?query`, por ejemplo:

- `GET /api/v1/integrations/n8n/teams/{teamId}/agents`
- `GET /api/v1/integrations/n8n/tickets/{id}`
- `GET /api/v1/integrations/n8n/tickets/waiting?hours=2`

La ventana de firma es de 5 minutos; por eso el workflow SLA **vuelve a firmar**
después del Wait.

Los secretos pertenecen a `.env`; nunca deben exportarse dentro del JSON del
workflow.
