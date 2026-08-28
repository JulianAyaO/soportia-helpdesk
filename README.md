# **Soportia — Sistema de Gestión de Soporte Técnico**

Una aplicación full stack de helpdesk interno con paneles para empleados, agentes y administradores, plazos de SLA, auditoría, llamadas en tiempo real y automatización recuperable con n8n.

## Demo

<br>

<p align="center">
  <img src="assets/demo.gif" alt="Demo de Soportia" width="720">
</p>

<p align="center">
  <em>Mesa de soporte con tickets, SLA, llamadas WebRTC y flujos de n8n orquestados desde Spring Boot.</em>
</p>

## Descripción general

Soportia está diseñada para gestionar el flujo de un ticket de soporte técnico, desde la solicitud del empleado hasta la cola del agente, la supervisión del administrador y las automatizaciones externas.

El proyecto busca demostrar reglas de negocio reales en un solo sistema: prioridad, transiciones de estado, comentarios, adjuntos, notificaciones, presencia, llamadas y auditoría. Los empleados crean tickets por categoría, impacto y urgencia. Los agentes atienden solo la cola de su equipo, responden, dejan notas internas y pueden llamar al solicitante si está en línea. Los administradores consultan el panel operativo, las personas, el Centro de automatización, los mensajes internos y el registro de auditoría.

Backend en Spring Boot, PostgreSQL, frontend en Angular y n8n como orquestador externo. Spring es la fuente de verdad: publica eventos firmados (HMAC) y aplica callbacks idempotentes; n8n no escribe en las tablas de la aplicación. Si n8n está apagado, la mesa sigue operando. Las llamadas van por WebRTC entre navegadores; el servidor solo señaliza por WebSocket.

## Características

- **Ciclo de vida de tickets:** Los tickets pasan por abierto, en progreso, en espera del solicitante, resuelto, cerrado y cancelado, con transiciones validadas en el servidor.
- **Prioridad y SLA:** La prioridad se calcula con una matriz de impacto y urgencia, y cada ticket conserva plazos de primera respuesta y resolución en horario laboral.
- **Colas por equipo:** Los agentes de accesos y de equipos ven únicamente los tickets de su área. El administrador supervisa toda la mesa y no recibe asignaciones automáticas.
- **Comentarios y notas internas:** El solicitante ve respuestas públicas; el personal puede dejar notas internas que no salen al empleado.
- **Adjuntos:** Se pueden adjuntar archivos al ticket y a los mensajes internos.
- **Notificaciones:** El usuario recibe avisos de asignación, respuestas, cambios de estado y acciones de automatización.
- **Presencia en línea:** Un canal WebSocket marca quién está conectado. En el ticket, el agente ve si el empleado está en línea antes de llamar.
- **Llamadas de voz, video y pantalla:** Desde el ticket o el chat interno se inicia una llamada WebRTC. Spring solo señaliza la sesión; el audio y el video van entre los navegadores.
- **Control de acceso por roles:** Empleado, agente de soporte y administrador, con autenticación JWT.
- **Enrutado automático:** Tras crear un ticket, n8n consulta la carga del equipo y pide a Spring asignar al agente con menos tickets abiertos.
- **Respuestas guiadas:** Si el texto menciona contraseña o VPN, n8n publica un comentario de ayuda y el ticket sigue en cola.
- **Escalación de SLA:** Si el ticket sigue abierto cerca del plazo, n8n espera, vuelve a consultarlo y puede subir la prioridad o reasignarlo a otro agente.
- **Recordatorio al solicitante:** Un flujo horario recuerda al empleado cuando el ticket espera su respuesta.
- **Auditoría:** Las acciones críticas quedan registradas para revisión administrativa.

## Screenshots

Capturas de las pantallas principales. Las imágenes están en [`assets/`](assets/).

### Acceso

<p align="center">
  <img src="assets/login.png" alt="Inicio de sesión" width="720">
</p>

<p align="center">
  <em>Inicio de sesión con cuentas de demostración por rol.</em>
</p>

### Empleado

| Panel | Nueva solicitud |
| :---: | :---: |
| <p align="center"><img src="assets/empleadoPanel.png" alt="Panel del empleado" width="420"></p> | <p align="center"><img src="assets/empleadoNuevaSolicitud.png" alt="Nueva solicitud" width="420"></p> |

| Detalle del ticket |
| :---: |
| <p align="center"><img src="assets/empleadoTicket.png" alt="Ticket del empleado" width="720"></p> |

### Agente

| Panel | Ticket en cola |
| :---: | :---: |
| <p align="center"><img src="assets/agentePanel.png" alt="Panel del agente" width="420"></p> | <p align="center"><img src="assets/agenteTicket.png" alt="Ticket del agente" width="420"></p> |

| Chat interno |
| :---: |
| <p align="center"><img src="assets/agenteChatAdmin.png" alt="Chat del agente con administración" width="720"></p> |

### Administración

| Panel operativo | Personas |
| :---: | :---: |
| <p align="center"><img src="assets/adminPanel.png" alt="Panel del administrador" width="420"></p> | <p align="center"><img src="assets/adminPersonas.png" alt="Personas" width="420"></p> |

| Centro de automatización | Auditoría |
| :---: | :---: |
| <p align="center"><img src="assets/adminCentroAutomatizaciones.png" alt="Centro de automatización" width="420"></p> | <p align="center"><img src="assets/adminAuditoria.png" alt="Registro de auditoría" width="420"></p> |

| Mensajes y llamadas |
| :---: |
| <p align="center"><img src="assets/adminMensajes-llamadas.png" alt="Mensajes internos y llamada en curso" width="720"></p> |

## Tecnologías utilizadas

### Frontend

- **Angular 22:** Utilizado para construir la aplicación web, las rutas y el estado de pantalla.
- **Angular Material / CDK:** Proporciona la interfaz, formularios, overlays y componentes de accesibilidad.
- **RxJS:** Gestiona las peticiones HTTP, el polling y el estado reactivo de la interfaz.
- **WebSocket nativo:** Mantiene la presencia en línea y la señalización de llamadas.
- **WebRTC:** Transporta el audio, el video y la pantalla compartida entre los participantes.
- **Playwright:** Utilizado para las pruebas de aceptación en el navegador.

### Backend

- **Java 21:** Lenguaje principal utilizado en el desarrollo del backend.
- **Spring Boot 4.1:** Framework backend utilizado para APIs REST, seguridad, programación de tareas y configuración.
- **Spring Security:** Gestiona la autenticación con JWT, la autorización y el control de acceso basado en roles.
- **JdbcClient:** Encargado del acceso SQL a PostgreSQL.
- **Spring WebSocket:** Proporciona presencia en línea, escritura en curso y señalización de llamadas.
- **Flyway:** Gestiona las migraciones de la base de datos.

### Base de datos

- **PostgreSQL:** Base de datos relacional principal del sistema. Conserva tickets, historial, auditoría y el outbox de eventos hacia n8n.

### Herramientas / Librerías / Servicios

- **Docker Compose:** Utilizado para ejecutar PostgreSQL, el API, el frontend y n8n en local.
- **n8n:** Orquestador externo de enrutado, respuestas guiadas, escalación de SLA y recordatorios. Recibe webhooks firmados y responde con callbacks idempotentes.
- **Maven Wrapper:** Herramienta de construcción del backend, incluida en el proyecto para facilitar la portabilidad.
- **npm:** Gestor de paquetes del frontend.
- **Micrometer / Actuator:** Proporcionan endpoints de métricas y verificación de estado.
- **Swagger / OpenAPI:** Proporcionan la documentación de la API y sus endpoints.

## Requisitos e instalación

* Docker Desktop
* Java 21, Node.js 22 y npm (solo si se ejecuta fuera de Docker)

## Instalación rápida

```powershell
# 1. Clonar el repositorio
git clone https://github.com/JulianAyaO/sistema_tickets.git
cd sistema_tickets

# 2. Configurar el entorno
copy .env.example .env

# 3. Levantar el stack
docker compose --env-file .env up --build
```

La aplicación queda en:

```text
http://localhost:4200
```

El API en `http://localhost:8080/api/v1`, n8n en `http://localhost:5678` y HTTPS local en `https://localhost:4243` (útil para cámara y micrófono en algunos navegadores). La salud del backend se comprueba en:

```text
http://localhost:8080/actuator/health
```

Para activar las automatizaciones, abre n8n, importa los JSON de `automation/workflows` y publícalos. Los webhooks esperados son `soportia-ticket-routing` y `soportia-sla-alerts`.

## Variables de entorno

Copia el archivo `.env.example` si necesitas personalizar la configuración. En desarrollo local, los valores por defecto suelen ser suficientes.

| Variable | Descripción |
| --- | --- |
| `POSTGRES_*` | Conexión a PostgreSQL de la aplicación |
| `N8N_DB_*` | Base de metadatos de n8n, creada en el primer arranque |
| `JWT_SECRET` | Clave para generar y validar tokens JWT |
| `N8N_HMAC_SECRET` | Secreto compartido para firmar webhooks y callbacks (`X-Soportia-Timestamp` y `X-Soportia-Signature`) |
| `N8N_ROUTING_WEBHOOK_URL` | Webhook de n8n para el enrutado de tickets nuevos |
| `N8N_SLA_WEBHOOK_URL` | Webhook de n8n para tickets con SLA en riesgo |
| `SOPORTIA_SLA_WAIT_SECONDS` | Espera de n8n antes de volver a consultar un ticket en riesgo |
| `SOPORTIA_WAITING_HOURS` | Horas sin respuesta del solicitante antes del recordatorio |

## Despliegue

Actualmente, el proyecto está orientado principalmente a **desarrollo y ejecución en entorno local**. Por el momento no se encuentra disponible una demo pública en la web.

## Uso del sistema

Todas las cuentas demo usan la contraseña `Demo123!`.

| Persona | Correo | Rol |
| --- | --- | --- |
| Camila Restrepo | `employee@soportia.local` | Empleada de tesorería |
| Andrés Molina | `agent@soportia.local` | Agente de accesos y cuentas |
| Juliana Pérez | `it-agent@soportia.local` | Agente de equipos |
| Marta Suárez | `admin@soportia.local` | Administradora de la mesa |

1. El empleado inicia sesión y crea un ticket con categoría, impacto, urgencia y descripción.
2. Spring calcula la prioridad y los plazos de SLA, deja el ticket en la cola del equipo y registra un evento outbox.
3. n8n recibe el evento, consulta los agentes del equipo y pide asignar al de menor carga. Si el texto menciona contraseña o VPN, publica una guía y el ticket sigue abierto.
4. El agente toma el ticket, responde, deja notas internas o lo pasa a espera / resuelto. Si el empleado está en línea, puede llamarlo desde el detalle.
5. Si el ticket sigue abierto cerca del plazo, n8n espera, vuelve a leer el estado y solo escala si nadie lo ha tomado: sube la prioridad y, si hace falta, lo reasigna.
6. Si el ticket espera respuesta del empleado, un flujo horario envía un recordatorio.
7. El administrador consulta el panel, las personas, el Centro de automatización, los mensajes internos y la auditoría. Puede tomar un ticket a mano, pero la automatización no se lo asigna.

## Estructura del proyecto

```text
sistema_tickets/
├── .github/workflows/         # configuración de integración continua (CI)
├── assets/                    # gif de demo y capturas para el README
├── automation/                # flujos n8n y contrato de automatización
├── backend/                   # API y lógica del backend con Spring Boot
├── frontend/                  # aplicación web desarrollada con Angular
├── infra/                     # inicialización adicional de PostgreSQL
├── compose.yaml               # PostgreSQL, backend, frontend y n8n
├── .env.example               # ejemplo de variables de entorno
└── README.md
```

## Autor

**Julian Aya Orozco**

[![GitHub](https://img.shields.io/badge/GitHub-JulianAyaO-181717?style=flat&logo=github)](https://github.com/JulianAyaO)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Julian_Aya_Orozco-0A66C2?style=flat&logo=linkedin)](https://www.linkedin.com/in/julian-aya-orozco-338a78431/)
