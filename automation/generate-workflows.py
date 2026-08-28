"""Regenerate n8n workflow JSON under automation/workflows.

HMAC secrets are read at runtime from n8n environment variables, not written here.
Run from the repo root: python automation/generate-workflows.py
"""
import json
from pathlib import Path

out = Path(__file__).resolve().parent / 'workflows'

HMAC = r"""
const crypto = require('crypto');
function hv(h, n) {
  const key = Object.keys(h || {}).find((k) => String(k).toLowerCase() === n);
  if (!key) return '';
  const value = h[key];
  return String(Array.isArray(value) ? value[0] : value ?? '');
}
function decodeBinary(binary) {
  if (!binary) return '';
  const part = binary.data || binary.rawBody;
  if (!part) return '';
  if (Buffer.isBuffer(part)) return part.toString('utf8');
  if (typeof part === 'string') return part;
  if (part.data) return Buffer.from(part.data, part.encoding || 'base64').toString('utf8');
  return '';
}
function sign(secret, timestamp, payload) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(String(timestamp) + '.' + payload, 'utf8').digest('hex');
}
function signedCallback(secret, body, key) {
  const rawBody = JSON.stringify(body);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  return { rawBody, timestamp, signature: sign(secret, timestamp, rawBody), idempotencyKey: key };
}
function readWebhook() {
  const item = (typeof $input !== 'undefined' && $input.first) ? $input.first() : { json: $json, binary: typeof $binary !== 'undefined' ? $binary : {} };
  const json = item.json || {};
  const headers = json.headers || {};
  const incomingTimestamp = hv(headers, 'x-soportia-timestamp');
  const incomingSignature = hv(headers, 'x-soportia-signature');
  const secret = $env.SOPORTIA_HMAC_SECRET;
  let requestBody = typeof json.rawBody === 'string' ? json.rawBody : '';
  if (!requestBody) requestBody = decodeBinary(item.binary);
  if (!requestBody) throw new Error('Missing raw webhook body for signature verification. Enable Raw Body on the webhook node.');
  const expected = sign(secret, incomingTimestamp, requestBody);
  if (!incomingTimestamp || !incomingSignature || expected.length !== incomingSignature.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(incomingSignature))) {
    throw new Error('Invalid Soportia signature');
  }
  const event = (json.body && typeof json.body === 'object') ? json.body : JSON.parse(requestBody);
  return { secret, event };
}
""".strip()

ROUTE_VALIDATE = HMAC + r"""
const { secret, event } = readWebhook();
if (event.eventType !== 'ticket.created') return [];
const teamId = event.payload.suggestedTeamId;
if (!teamId) return [];
const path = '/api/v1/integrations/n8n/teams/' + teamId + '/agents';
const getTimestamp = Math.floor(Date.now() / 1000).toString();
return [{ json: {
  eventId: event.eventId,
  ticketId: event.payload.ticketId,
  teamId,
  title: event.payload.title || '',
  description: event.payload.description || '',
  agentsPath: '/integrations/n8n/teams/' + teamId + '/agents',
  getTimestamp,
  getSignature: sign(secret, getTimestamp, 'GET ' + path)
}}];
"""

ROUTE_PICK = HMAC + r"""
const secret = $env.SOPORTIA_HMAC_SECRET;
const prev = $('Validate and prepare').first().json;
const agents = Array.isArray($json.agents) ? $json.agents : [];
const pick = agents[0];
const assign = {
  automationId: '60000000-0000-0000-0000-000000000001',
  eventId: prev.eventId,
  status: 'SUCCESS',
  result: pick ? ('Assigned to ' + pick.displayName + ' (open ' + pick.openCount + ')') : 'Routed to team without agent',
  ticketId: prev.ticketId,
  teamId: prev.teamId
};
if (pick && pick.id) assign.assigneeId = pick.id;
const text = (prev.title + ' ' + prev.description).toLowerCase();
let comment = null;
if (/contrase[nñ]a|password|\bclave\b/.test(text)) {
  comment = 'Hola, recibimos tu solicitud de acceso. Mientras un técnico la toma, prueba esto: 1) Usa la página de restablecimiento de la empresa. 2) Indica tu correo corporativo. 3) Revisa spam y espera unos minutos. Si ya lo intentaste, responde aquí con el mensaje de error exacto.';
} else if (/\bvpn\b/.test(text)) {
  comment = 'Hola, para la VPN: 1) Confirma que el cliente está actualizado. 2) Prueba otra red (datos móviles). 3) Restablece la contraseña del cliente VPN. Si sigue fallando, comenta el error que muestra la app.';
} else if (/outlook|correo corporativo|e-?mail/.test(text)) {
  comment = 'Hola, para el correo: 1) Cierra Outlook por completo. 2) Vuelve a iniciar sesión con la cuenta corporativa. 3) Si pide contraseña en bucle, restablécela y espera 10 minutos. Un técnico revisará el ticket si no entra.';
}
const out = { assign: signedCallback(secret, assign, prev.eventId + ':auto-route') };
if (comment) {
  out.reply = signedCallback(secret, {
    automationId: '60000000-0000-0000-0000-000000000004',
    eventId: prev.eventId,
    status: 'SUCCESS',
    result: 'Published guided reply',
    ticketId: prev.ticketId,
    comment
  }, prev.eventId + ':keyword-reply');
}
return [{ json: out }];
"""

SLA_VALIDATE = HMAC + r"""
const { secret, event } = readWebhook();
if (!String(event.eventType).startsWith('ticket.sla.')) throw new Error('Unsupported SLA event: ' + event.eventType);
const ticketId = event.payload.ticketId;
const path = '/api/v1/integrations/n8n/tickets/' + ticketId;
const getTimestamp = Math.floor(Date.now() / 1000).toString();
return [{ json: {
  eventId: event.eventId,
  eventType: event.eventType,
  ticketId,
  atRisk: event.eventType === 'ticket.sla.at_risk',
  getPath: '/integrations/n8n/tickets/' + ticketId,
  getTimestamp,
  getSignature: sign(secret, getTimestamp, 'GET ' + path)
}}];
"""

SLA_DECIDE = HMAC + r"""
const secret = $env.SOPORTIA_HMAC_SECRET;
const prev = $('Validate and prepare').first().json;
if ($json.status !== 'OPEN') return [];
const teamId = $json.teamId;
const agentsPath = '/api/v1/integrations/n8n/teams/' + teamId + '/agents';
const getTimestamp = Math.floor(Date.now() / 1000).toString();
return [{ json: {
  ...prev,
  currentAssignee: $json.assigneeId || null,
  teamId,
  agentsPath: '/integrations/n8n/teams/' + teamId + '/agents',
  getTimestamp,
  getSignature: sign(secret, getTimestamp, 'GET ' + agentsPath)
}}];
"""

SLA_ESCALATE = HMAC + r"""
const secret = $env.SOPORTIA_HMAC_SECRET;
const prev = $('Still open?').first().json;
const agents = Array.isArray($json.agents) ? $json.agents.filter((a) => a.id !== prev.currentAssignee) : [];
const pick = agents[0];
const body = {
  automationId: '60000000-0000-0000-0000-000000000002',
  eventId: prev.eventId,
  status: 'SUCCESS',
  result: 'Escalated open ticket after SLA wait',
  ticketId: prev.ticketId,
  bumpPriority: true,
  notifyAdmin: true,
  forceAssign: true
};
if (pick && pick.id) body.assigneeId = pick.id;
return [{ json: signedCallback(secret, body, prev.eventId + ':sla-escalate') }];
"""

WAIT_SIGN = HMAC + r"""
const secret = $env.SOPORTIA_HMAC_SECRET;
const hours = Number($env.SOPORTIA_WAITING_HOURS || 2);
const path = '/api/v1/integrations/n8n/tickets/waiting?hours=' + hours;
const getTimestamp = Math.floor(Date.now() / 1000).toString();
return [{ json: {
  hours,
  waitingPath: '/integrations/n8n/tickets/waiting?hours=' + hours,
  getTimestamp,
  getSignature: sign(secret, getTimestamp, 'GET ' + path)
}}];
"""

WAIT_BUILD = HMAC + r"""
const secret = $env.SOPORTIA_HMAC_SECRET;
const tickets = Array.isArray($json.tickets) ? $json.tickets : [];
return tickets.map((ticket) => {
  const body = {
    automationId: '60000000-0000-0000-0000-000000000003',
    eventId: null,
    status: 'SUCCESS',
    result: 'Reminded requester on waiting ticket',
    ticketId: ticket.id,
    reminder: true
  };
  return { json: signedCallback(secret, body, 'waiting-reminder:' + ticket.id) };
});
"""

def webhook(name, path, webhook_id, node_id):
    return {
        "parameters": {
            "httpMethod": "POST",
            "path": path,
            "responseMode": "onReceived",
            "options": {"rawBody": True},
        },
        "id": node_id,
        "name": name,
        "type": "n8n-nodes-base.webhook",
        "typeVersion": 2,
        "position": [-520, 0],
        "webhookId": webhook_id,
    }

def code(name, js, node_id, x, y=0):
    return {
        "parameters": {"jsCode": js.strip() + "\n"},
        "id": node_id,
        "name": name,
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [x, y],
    }

def http_post_callback(name, node_id, x, prefix="$json"):
    return {
        "parameters": {
            "method": "POST",
            "url": "={{ $env.SOPORTIA_API_URL + '/integrations/n8n/callback' }}",
            "sendHeaders": True,
            "headerParameters": {
                "parameters": [
                    {"name": "X-Soportia-Timestamp", "value": f"={{{{ {prefix}.timestamp }}}}"},
                    {"name": "X-Soportia-Signature", "value": f"={{{{ {prefix}.signature }}}}"},
                    {"name": "X-Idempotency-Key", "value": f"={{{{ {prefix}.idempotencyKey }}}}"},
                ]
            },
            "sendBody": True,
            "contentType": "raw",
            "rawContentType": "application/json",
            "body": f"={{{{ {prefix}.rawBody }}}}",
            "options": {"timeout": 5000},
        },
        "id": node_id,
        "name": name,
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [x, 0],
    }

def http_get(name, node_id, x, path_expr, ts_expr, sig_expr):
    return {
        "parameters": {
            "method": "GET",
            "url": f"={{{{ $env.SOPORTIA_API_URL + {path_expr} }}}}",
            "sendHeaders": True,
            "headerParameters": {
                "parameters": [
                    {"name": "X-Soportia-Timestamp", "value": f"={{{{ {ts_expr} }}}}"},
                    {"name": "X-Soportia-Signature", "value": f"={{{{ {sig_expr} }}}}"},
                ]
            },
            "options": {"timeout": 5000},
        },
        "id": node_id,
        "name": name,
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [x, 0],
    }

def iff(name, node_id, x, left, right, y=0):
    return {
        "parameters": {
            "conditions": {
                "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict", "version": 2},
                "conditions": [{
                    "id": "c1",
                    "leftValue": left,
                    "rightValue": right,
                    "operator": {"type": "string", "operation": "equals"},
                }],
                "combinator": "and",
            },
            "options": {},
        },
        "id": node_id,
        "name": name,
        "type": "n8n-nodes-base.if",
        "typeVersion": 2.2,
        "position": [x, y],
    }

route = {
    "name": "Soportia - Auto Route Ticket",
    "nodes": [
        webhook("Ticket event", "soportia-ticket-routing", "soportia-ticket-routing", "9b8ff28d-cf6d-4e8a-b9fd-e3df1a869001"),
        code("Validate and prepare", ROUTE_VALIDATE, "734de4bb-4d71-4237-ae83-0f9dcf4d7002", -240),
        http_get("Load agents", "a11ce000-0000-0000-0000-000000000001", 40, "$json.agentsPath", "$json.getTimestamp", "$json.getSignature"),
        code("Pick agent and reply", ROUTE_PICK, "a11ce000-0000-0000-0000-000000000002", 320),
        http_post_callback("Record assignment", "f05ce3c2-0f0e-4d59-9e34-aa8349461003", 600, "$json.assign"),
        iff("Needs reply?", "a11ce000-0000-0000-0000-000000000003", 860, "={{ $json.reply ? 'yes' : 'no' }}", "yes"),
        http_post_callback("Record reply", "a11ce000-0000-0000-0000-000000000004", 1120, "$json.reply"),
    ],
    "connections": {
        "Ticket event": {"main": [[{"node": "Validate and prepare", "type": "main", "index": 0}]]},
        "Validate and prepare": {"main": [[{"node": "Load agents", "type": "main", "index": 0}]]},
        "Load agents": {"main": [[{"node": "Pick agent and reply", "type": "main", "index": 0}]]},
        "Pick agent and reply": {"main": [[{"node": "Record assignment", "type": "main", "index": 0}]]},
        "Record assignment": {"main": [[{"node": "Needs reply?", "type": "main", "index": 0}]]},
        "Needs reply?": {"main": [[{"node": "Record reply", "type": "main", "index": 0}]]},
    },
    "pinData": {},
    "active": False,
    "settings": {"executionOrder": "v1"},
    "versionId": "42d02b3c-80ee-4a2e-b052-0accc56cc002",
    "meta": {"templateCredsSetupCompleted": True},
    "tags": [],
}

# After Record assignment, $json is HTTP response not assign/reply.
# Need to pass reply through. Fix: Pick outputs assign+reply, Record assignment should not be the source of IF.
# Connect Pick to BOTH Record assignment AND Needs reply? — Needs reply reads $json.reply from Pick if we connect Pick -> IF directly.

route["connections"]["Pick agent and reply"] = {"main": [[
    {"node": "Record assignment", "type": "main", "index": 0},
    {"node": "Needs reply?", "type": "main", "index": 0},
]]}
del route["connections"]["Record assignment"]

sla = {
    "name": "Soportia - SLA Alert",
    "nodes": [
        webhook("SLA event", "soportia-sla-alerts", "soportia-sla-alerts", "5645e14a-5cff-47ee-ab07-78c993a29001"),
        code("Validate and prepare", SLA_VALIDATE, "50c79a0b-b9a0-4cfa-9b5c-931e6b0d1002", -240),
        iff("At risk?", "b22ce000-0000-0000-0000-000000000001", 40, "={{ $json.atRisk ? 'yes' : 'no' }}", "yes"),
        {
            "parameters": {
                "resume": "timeInterval",
                "amount": "={{ Number($env.SOPORTIA_SLA_WAIT_SECONDS || 15) }}",
                "unit": "seconds",
            },
            "id": "b22ce000-0000-0000-0000-000000000002",
            "name": "Wait",
            "type": "n8n-nodes-base.wait",
            "typeVersion": 1.1,
            "position": [280, -120],
            "webhookId": "soportia-sla-wait",
        },
        http_get("Load ticket", "b22ce000-0000-0000-0000-000000000003", 520, "$json.getPath", "$json.getTimestamp", "$json.getSignature"),
        code("Still open?", SLA_DECIDE, "b22ce000-0000-0000-0000-000000000004", 760),
        http_get("Load agents", "b22ce000-0000-0000-0000-000000000005", 1000, "$json.agentsPath", "$json.getTimestamp", "$json.getSignature"),
        code("Build escalation", SLA_ESCALATE, "b22ce000-0000-0000-0000-000000000006", 1240),
        http_post_callback("Record escalation", "8597102e-104f-4c3e-9834-5ffb11251003", 1480, "$json"),
    ],
    "connections": {
        "SLA event": {"main": [[{"node": "Validate and prepare", "type": "main", "index": 0}]]},
        "Validate and prepare": {"main": [[{"node": "At risk?", "type": "main", "index": 0}]]},
        "At risk?": {"main": [
            [{"node": "Wait", "type": "main", "index": 0}],
            [{"node": "Load ticket", "type": "main", "index": 0}],
        ]},
        "Wait": {"main": [[{"node": "Load ticket", "type": "main", "index": 0}]]},
        "Load ticket": {"main": [[{"node": "Still open?", "type": "main", "index": 0}]]},
        "Still open?": {"main": [[{"node": "Load agents", "type": "main", "index": 0}]]},
        "Load agents": {"main": [[{"node": "Build escalation", "type": "main", "index": 0}]]},
        "Build escalation": {"main": [[{"node": "Record escalation", "type": "main", "index": 0}]]},
    },
    "pinData": {},
    "active": False,
    "settings": {"executionOrder": "v1"},
    "versionId": "1e9c7633-e32c-445c-a7f2-d7e25e898002",
    "meta": {"templateCredsSetupCompleted": True},
    "tags": [],
}

# Wait node resumes with previous json - getTimestamp may be stale (>300s if wait is 15 min).
# MUST re-sign GET after wait. Fix: after Wait, a "Resign GET" code node.

RESIGN = HMAC + r"""
const secret = $env.SOPORTIA_HMAC_SECRET;
const ticketId = $json.ticketId;
const path = '/api/v1/integrations/n8n/tickets/' + ticketId;
const getTimestamp = Math.floor(Date.now() / 1000).toString();
return [{ json: {
  ...$json,
  getPath: '/integrations/n8n/tickets/' + ticketId,
  getTimestamp,
  getSignature: sign(secret, getTimestamp, 'GET ' + path)
}}];
"""

sla["nodes"].insert(4, code("Refresh signature", RESIGN, "b22ce000-0000-0000-0000-000000000007", 400, 0))
sla["connections"]["At risk?"] = {"main": [
    [{"node": "Wait", "type": "main", "index": 0}],
    [{"node": "Refresh signature", "type": "main", "index": 0}],
]}
sla["connections"]["Wait"] = {"main": [[{"node": "Refresh signature", "type": "main", "index": 0}]]}
sla["connections"]["Refresh signature"] = {"main": [[{"node": "Load ticket", "type": "main", "index": 0}]]}

# Still open? uses GET ticket json which OVERWRITES prev. Still open? reads $('Validate and prepare') and $json from Load ticket. Good.
# After wait, Validate and prepare still in execution. Good.
# Load agents after Still open? - Still open resigns agents GET. SLA_DECIDE sets new getTimestamp. Good.

reminder = {
    "name": "Soportia - Waiting Reminder",
    "nodes": [
        {
            "parameters": {"rule": {"interval": [{"field": "hours", "hoursInterval": 1}]}},
            "id": "c33ce000-0000-0000-0000-000000000001",
            "name": "Every hour",
            "type": "n8n-nodes-base.scheduleTrigger",
            "typeVersion": 1.2,
            "position": [-360, 0],
        },
        code("Sign query", WAIT_SIGN, "c33ce000-0000-0000-0000-000000000002", -80),
        http_get("Load waiting tickets", "c33ce000-0000-0000-0000-000000000003", 200, "$json.waitingPath", "$json.getTimestamp", "$json.getSignature"),
        code("Build reminders", WAIT_BUILD, "c33ce000-0000-0000-0000-000000000004", 480),
        http_post_callback("Record reminder", "c33ce000-0000-0000-0000-000000000005", 760, "$json"),
    ],
    "connections": {
        "Every hour": {"main": [[{"node": "Sign query", "type": "main", "index": 0}]]},
        "Sign query": {"main": [[{"node": "Load waiting tickets", "type": "main", "index": 0}]]},
        "Load waiting tickets": {"main": [[{"node": "Build reminders", "type": "main", "index": 0}]]},
        "Build reminders": {"main": [[{"node": "Record reminder", "type": "main", "index": 0}]]},
    },
    "pinData": {},
    "active": False,
    "settings": {"executionOrder": "v1"},
    "versionId": "c33ce000-0000-0000-0000-000000000099",
    "meta": {"templateCredsSetupCompleted": True},
    "tags": [],
}

(out / "auto-route-ticket.json").write_text(json.dumps(route, indent=2), encoding="utf-8")
(out / "sla-alert.json").write_text(json.dumps(sla, indent=2), encoding="utf-8")
(out / "waiting-reminder.json").write_text(json.dumps(reminder, indent=2), encoding="utf-8")
print("wrote", list(out.glob("*.json")))
