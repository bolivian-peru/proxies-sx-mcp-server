/**
 * Support Tools
 * MCP tools for support tickets
 */

import { z } from 'zod';
import type { ProxiesApi } from '../api/index.js';
import { readOnly, mutating } from './annotations.js';

const CATEGORIES = ['technical', 'billing', 'general', 'feature_request', 'port_issue', 'port_addition_request'] as const;
const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

const STATUS_LABELS: Record<string, string> = {
  open: 'open (waiting for support)',
  in_progress: 'in progress (support is working on it)',
  waiting_customer: 'waiting for your reply',
  resolved: 'resolved',
  closed: 'closed',
};

const ticketId = { type: 'string', description: 'Ticket ID from list_my_tickets (the ID, not the TKT- number)' };

export const supportToolDefinitions = [
  {
    name: 'create_support_ticket',
    annotations: mutating('Create Support Ticket'),
    description: 'Open a support ticket that a person at Proxies.sx reads and answers. Use it for problems the tools cannot solve and for billing questions. At most 3 new tickets per minute.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        subject: { type: 'string', minLength: 1, maxLength: 200, description: 'Short summary (up to 200 characters)' },
        message: { type: 'string', minLength: 1, maxLength: 5000, description: 'What happened, what you expected, and any request id or error code (up to 5000 characters)' },
        category: { type: 'string', enum: CATEGORIES, description: 'Ticket category (default: general)' },
        priority: { type: 'string', enum: PRIORITIES, description: 'Priority (default: medium)' },
      },
      required: ['subject', 'message'],
    },
  },
  {
    name: 'list_my_tickets',
    annotations: readOnly('List My Tickets'),
    description: 'List your support tickets with their status and IDs.',
    inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
  },
  {
    name: 'get_ticket',
    annotations: readOnly('Get Ticket'),
    description: 'Get one support ticket with the original message and every reply.',
    inputSchema: { type: 'object' as const, properties: { ticketId }, required: ['ticketId'] },
  },
  {
    name: 'reply_to_ticket',
    annotations: mutating('Reply to Ticket'),
    description: 'Add a reply to one of your support tickets.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        ticketId,
        message: { type: 'string', minLength: 1, maxLength: 10000, description: 'Your reply (up to 10000 characters)' },
      },
      required: ['ticketId', 'message'],
    },
  },
  {
    name: 'close_ticket',
    annotations: mutating('Close Ticket', true),
    description: 'Close one of your support tickets once the problem is solved.',
    inputSchema: { type: 'object' as const, properties: { ticketId }, required: ['ticketId'] },
  },
] as const;

const ticketOnly = z.object({ ticketId: z.string().min(1) });

export const supportSchemas = {
  create_support_ticket: z.object({
    subject: z.string().min(1).max(200),
    message: z.string().min(1).max(5000),
    category: z.enum(CATEGORIES).optional(),
    priority: z.enum(PRIORITIES).optional(),
  }),
  list_my_tickets: z.object({}),
  get_ticket: ticketOnly,
  reply_to_ticket: ticketOnly.extend({ message: z.string().min(1).max(10000) }),
  close_ticket: ticketOnly,
};

interface TicketReply {
  message: string;
  authorType: 'customer' | 'support';
  createdAt: string;
}

interface Ticket {
  _id: string;
  ticketNumber?: string;
  subject: string;
  message?: string;
  category?: string;
  priority?: string;
  status: string;
  replies?: TicketReply[];
  createdAt: string;
}

function ticketHeader(ticket: Ticket): string[] {
  return [
    `Ticket ${ticket.ticketNumber ?? ticket._id}: ${ticket.subject}`,
    `ID: ${ticket._id}`,
    `Status: ${STATUS_LABELS[ticket.status] ?? ticket.status}`,
    `Category: ${ticket.category ?? 'general'}, priority: ${ticket.priority ?? 'medium'}`,
    `Created: ${new Date(ticket.createdAt).toISOString()}`,
  ];
}

/** Handlers let errors propagate to the server's single tool-error path. */
export function createSupportToolHandlers(api: ProxiesApi) {
  return {
    async create_support_ticket(args: z.infer<typeof supportSchemas.create_support_ticket>): Promise<string> {
      const ticket = await api.client.post<Ticket>('/v1/tickets', {
        subject: args.subject,
        message: args.message,
        category: args.category ?? 'general',
        priority: args.priority ?? 'medium',
      });

      return [
        'Support ticket created.',
        '',
        ...ticketHeader(ticket),
        '',
        'Check for an answer with get_ticket, and add details with reply_to_ticket.',
      ].join('\n');
    },

    async list_my_tickets(): Promise<string> {
      const tickets = await api.client.get<Ticket[]>('/v1/tickets');

      if (tickets.length === 0) {
        return 'No support tickets on this account. Open one with create_support_ticket.';
      }

      const lines = [`Your support tickets (${tickets.length}):`];
      for (const ticket of tickets) {
        lines.push('', ...ticketHeader(ticket));
      }
      return lines.join('\n');
    },

    async get_ticket(args: z.infer<typeof ticketOnly>): Promise<string> {
      const ticket = await api.client.get<Ticket>(`/v1/tickets/${args.ticketId}`);
      const lines = [...ticketHeader(ticket), '', 'Your message:', ticket.message ?? '(not returned)'];

      const replies = ticket.replies ?? [];
      if (replies.length === 0) {
        lines.push('', 'No replies yet.');
      }
      for (const reply of replies) {
        const author = reply.authorType === 'support' ? 'Support' : 'You';
        lines.push('', `${author}, ${new Date(reply.createdAt).toISOString()}:`, reply.message);
      }

      return lines.join('\n');
    },

    async reply_to_ticket(args: z.infer<typeof supportSchemas.reply_to_ticket>): Promise<string> {
      await api.client.post(`/v1/tickets/${args.ticketId}/replies`, { message: args.message });
      return `Reply added to ticket ${args.ticketId}. Support is notified.`;
    },

    async close_ticket(args: z.infer<typeof ticketOnly>): Promise<string> {
      await api.client.patch(`/v1/tickets/${args.ticketId}/close`);
      return `Ticket ${args.ticketId} is closed. Open a new ticket if the problem returns.`;
    },
  };
}
