import { uiLabel } from './labels';

export function automationWhen(eventType: string): string {
  return ({
    'ticket.created': 'Cuando llega un ticket nuevo',
    'ticket.assigned': 'Cuando se asigna un ticket',
    'ticket.status.changed': 'Cuando cambia el estado de un ticket',
    'ticket.comment.created': 'Cuando alguien comenta un ticket',
    'ticket.sla.at_risk': 'Cuando un ticket se acerca al plazo de SLA',
    'ticket.sla.breached': 'Cuando se incumple el plazo de SLA',
    'ticket.waiting.reminder': 'Cada hora, si el solicitante no responde',
  } as Record<string, string>)[eventType] ?? `Cuando ocurre ${eventType}`;
}

export function automationConditionText(value: Record<string, unknown> | undefined): string {
  if (!value || !Object.keys(value).length) return 'Se aplica a cualquier ticket.';
  const parts: string[] = [];
  if (value['source'] === 'category.defaultTeam') {
    parts.push('la persona eligió una categoría');
  }
  const sla = value['slaStatus'];
  if (Array.isArray(sla) && sla.length) {
    parts.push('el plazo está ' + sla.map(item => uiLabel(String(item))).join(' o '));
  }
  if (value['priority']) parts.push('la prioridad es ' + uiLabel(String(value['priority'])));
  if (value['status']) parts.push('el estado es ' + uiLabel(String(value['status'])));
  if (value['hours']) parts.push('lleva más de ' + value['hours'] + ' h sin respuesta');
  const keywords = value['keywords'];
  if (Array.isArray(keywords) && keywords.length) {
    parts.push('el texto menciona ' + keywords.map(item => String(item)).join(' o '));
  }
  if (!parts.length) return 'Se aplica según las reglas internas configuradas.';
  return 'Solo si ' + parts.join(' y ') + '.';
}

export function automationActionText(value: Record<string, unknown> | undefined): string {
  if (!value || !Object.keys(value).length) return 'No hay una acción definida.';
  return ({
    ROUTE_TEAM: 'Lo envía al equipo de la categoría y al agente con menos tickets abiertos.',
    NOTIFY_SUPPORT: 'Avisa a los agentes de soporte para que lo atiendan.',
    ASSIGN_AGENT: 'Se lo asigna al agente con menos tickets abiertos.',
    ESCALATE_OPEN: 'Espera, comprueba si sigue abierto y sube prioridad o reasigna.',
    NOTIFY_REQUESTER: 'Recuerda al empleado que el ticket espera su respuesta.',
    PUBLIC_COMMENT: 'Publica una respuesta guiada sin sacar el ticket de la cola.',
  } as Record<string, string>)[String(value['type'] ?? '')] ?? 'Ejecuta la acción configurada en la automatización.';
}
