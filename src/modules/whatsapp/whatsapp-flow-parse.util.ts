import { AppError } from '../../utils/app-error';
import {
  WhatsAppFlowDefinition,
  WhatsAppFlowNode,
  WhatsAppFlowEdge,
  WhatsAppFlowNodeType,
} from '../../entities/WhatsAppFlow';

// Extracted from admin.service.ts so both the tenant flow builder and the
// standalone shop flow builder can turn an AI's raw text reply into a
// validated, auto-laid-out node/edge graph without duplicating this BFS
// layout logic.
export function parseGeneratedFlow(raw: string): WhatsAppFlowDefinition {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    throw AppError.unprocessable(
      'AI did not return a valid flow — try rephrasing your description.',
    );
  }

  let parsed: {
    nodes?: { id?: string; type?: string; data?: Record<string, unknown> }[];
    edges?: { source?: string; target?: string; sourceHandle?: string }[];
  };
  try {
    parsed = JSON.parse(match[0]) as typeof parsed;
  } catch {
    throw AppError.unprocessable(
      'AI returned malformed flow JSON — try rephrasing your description.',
    );
  }

  if (!Array.isArray(parsed.nodes) || parsed.nodes.length === 0) {
    throw AppError.unprocessable('AI response had no nodes.');
  }

  const validIds = new Set(
    parsed.nodes.filter((n) => n.id && n.type).map((n) => n.id as string),
  );
  const rawEdges = (parsed.edges ?? []).filter(
    (e) =>
      e.source &&
      e.target &&
      validIds.has(e.source) &&
      validIds.has(e.target),
  );

  // BFS layering from the start node so the generated graph renders in a
  // sensible top-to-bottom layout without the AI needing to reason about
  // pixel coordinates at all.
  const outgoingBySource = new Map<string, typeof rawEdges>();
  for (const e of rawEdges) {
    const list = outgoingBySource.get(e.source as string) ?? [];
    list.push(e);
    outgoingBySource.set(e.source as string, list);
  }

  const startNode = parsed.nodes.find((n) => n.type === 'start' && n.id);
  const depth = new Map<string, number>();
  if (startNode?.id) {
    const queue: string[] = [startNode.id];
    depth.set(startNode.id, 0);
    while (queue.length > 0) {
      const cur = queue.shift() as string;
      for (const e of outgoingBySource.get(cur) ?? []) {
        const target = e.target as string;
        if (!depth.has(target)) {
          depth.set(target, (depth.get(cur) ?? 0) + 1);
          queue.push(target);
        }
      }
    }
  }

  const columnCounters = new Map<number, number>();
  const nodes: WhatsAppFlowNode[] = parsed.nodes
    .filter(
      (
        n,
      ): n is { id: string; type: string; data?: Record<string, unknown> } =>
        Boolean(n.id && n.type),
    )
    .map((n) => {
      const d = depth.get(n.id) ?? 0;
      const col = columnCounters.get(d) ?? 0;
      columnCounters.set(d, col + 1);
      return {
        id: n.id,
        type: n.type as WhatsAppFlowNodeType,
        position: { x: col * 260, y: d * 140 },
        data: n.data ?? {},
      };
    });

  const edges: WhatsAppFlowEdge[] = rawEdges.map((e, i) => ({
    id: `e_ai_${i}`,
    source: e.source as string,
    target: e.target as string,
    sourceHandle: e.sourceHandle ?? null,
  }));

  return { nodes, edges };
}
