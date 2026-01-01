/**
 * Support Tools
 * Tools for submitting and managing support tickets
 */

import { z } from 'zod';
import type { ProxiesApi } from '../api/index.js';

// ==================== SCHEMAS ====================

const createTicketSchema = z.object({
  subject: z.string().min(5).max(200).describe('Brief description of the issue'),
  message: z.string().min(20).max(5000).describe('Detailed description of your issue or question'),
  category: z.enum(['technical', 'billing', 'account', 'other']).optional().describe('Ticket category'),
  priority: z.enum(['low', 'medium', 'high']).optional().describe('Issue priority'),
});

const replyToTicketSchema = z.object({
  ticketId: z.string().describe('The ticket ID to reply to'),
  message: z.string().min(10).max(5000).describe('Your reply message'),
});

const getTicketSchema = z.object({
  ticketId: z.string().describe('The ticket ID'),
});

export const supportSchemas = {
  create_support_ticket: createTicketSchema,
  reply_to_ticket: replyToTicketSchema,
  get_ticket: getTicketSchema,
  list_my_tickets: z.object({}),
  close_ticket: getTicketSchema,
};

// ==================== TOOL DEFINITIONS ====================

export const supportToolDefinitions = [
  {
    name: 'create_support_ticket',
    description: 'Submit a support ticket to contact human support. Use this when you need help from the Proxies.sx team, encounter issues you cannot resolve, or have billing/account questions.',
    inputSchema: {
      type: 'object',
      properties: {
        subject: {
          type: 'string',
          description: 'Brief description of the issue (5-200 characters)',
        },
        message: {
          type: 'string',
          description: 'Detailed description of your issue or question (20-5000 characters)',
        },
        category: {
          type: 'string',
          enum: ['technical', 'billing', 'account', 'other'],
          description: 'Ticket category (default: technical)',
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Issue priority (default: medium)',
        },
      },
      required: ['subject', 'message'],
    },
  },
  {
    name: 'list_my_tickets',
    description: 'List all your support tickets to check status and responses from support team',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_ticket',
    description: 'Get details of a specific support ticket including all replies',
    inputSchema: {
      type: 'object',
      properties: {
        ticketId: {
          type: 'string',
          description: 'The ticket ID',
        },
      },
      required: ['ticketId'],
    },
  },
  {
    name: 'reply_to_ticket',
    description: 'Reply to an existing support ticket',
    inputSchema: {
      type: 'object',
      properties: {
        ticketId: {
          type: 'string',
          description: 'The ticket ID to reply to',
        },
        message: {
          type: 'string',
          description: 'Your reply message (10-5000 characters)',
        },
      },
      required: ['ticketId', 'message'],
    },
  },
  {
    name: 'close_ticket',
    description: 'Close a support ticket when your issue is resolved',
    inputSchema: {
      type: 'object',
      properties: {
        ticketId: {
          type: 'string',
          description: 'The ticket ID to close',
        },
      },
      required: ['ticketId'],
    },
  },
] as const;

// ==================== TYPES ====================

interface Ticket {
  _id: string;
  subject: string;
  category?: string;
  priority?: string;
  status: string;
  replies?: TicketReply[];
  createdAt: string;
  updatedAt: string;
}

interface TicketReply {
  _id: string;
  message: string;
  isFromSupport: boolean;
  createdAt: string;
}

// ==================== HANDLERS ====================

export function createSupportToolHandlers(api: ProxiesApi) {
  return {
    /**
     * Create a new support ticket
     */
    async create_support_ticket(args: z.infer<typeof createTicketSchema>): Promise<string> {
      try {
        const ticket = await api.client.post<Ticket>('/tickets', {
          subject: args.subject,
          message: args.message,
          category: args.category || 'technical',
          priority: args.priority || 'medium',
        });

        const lines = [
          '# Support Ticket Created',
          '',
          `**Ticket ID:** ${ticket._id}`,
          `**Subject:** ${ticket.subject}`,
          `**Category:** ${ticket.category || 'technical'}`,
          `**Priority:** ${ticket.priority || 'medium'}`,
          `**Status:** ${ticket.status}`,
          '',
          'Your ticket has been submitted. The support team will respond as soon as possible.',
          '',
          'You can:',
          '- Use `list_my_tickets` to check all your tickets',
          '- Use `get_ticket` to see responses',
          '- Use `reply_to_ticket` to add more information',
        ];

        return lines.join('\n');
      } catch (error: any) {
        return `Error creating ticket: ${error.message}`;
      }
    },

    /**
     * List all user's tickets
     */
    async list_my_tickets(): Promise<string> {
      try {
        const tickets = await api.client.get<Ticket[]>('/tickets');

        if (!tickets || tickets.length === 0) {
          return 'No support tickets found. Use `create_support_ticket` to submit a new ticket.';
        }

        const lines = [
          '# Your Support Tickets',
          '',
          `Total: ${tickets.length} ticket(s)`,
          '',
        ];

        for (const ticket of tickets) {
          const statusEmoji = ticket.status === 'open' ? '🟢' :
                              ticket.status === 'pending' ? '🟡' :
                              ticket.status === 'resolved' ? '✅' : '⚪';

          lines.push(`## ${statusEmoji} ${ticket.subject}`);
          lines.push(`- **ID:** ${ticket._id}`);
          lines.push(`- **Status:** ${ticket.status}`);
          lines.push(`- **Category:** ${ticket.category || 'N/A'}`);
          lines.push(`- **Created:** ${new Date(ticket.createdAt).toLocaleString()}`);
          lines.push('');
        }

        return lines.join('\n');
      } catch (error: any) {
        return `Error fetching tickets: ${error.message}`;
      }
    },

    /**
     * Get ticket details with replies
     */
    async get_ticket(args: z.infer<typeof getTicketSchema>): Promise<string> {
      try {
        const ticket = await api.client.get<Ticket>(`/tickets/${args.ticketId}`);

        const lines = [
          `# Ticket: ${ticket.subject}`,
          '',
          `**ID:** ${ticket._id}`,
          `**Status:** ${ticket.status}`,
          `**Category:** ${ticket.category || 'N/A'}`,
          `**Priority:** ${ticket.priority || 'N/A'}`,
          `**Created:** ${new Date(ticket.createdAt).toLocaleString()}`,
          '',
        ];

        if (ticket.replies && ticket.replies.length > 0) {
          lines.push('## Conversation');
          lines.push('');

          for (const reply of ticket.replies) {
            const author = reply.isFromSupport ? '🛡️ Support' : '👤 You';
            lines.push(`### ${author} - ${new Date(reply.createdAt).toLocaleString()}`);
            lines.push(reply.message);
            lines.push('');
          }
        } else {
          lines.push('_No replies yet. The support team will respond soon._');
        }

        return lines.join('\n');
      } catch (error: any) {
        return `Error fetching ticket: ${error.message}`;
      }
    },

    /**
     * Reply to a ticket
     */
    async reply_to_ticket(args: z.infer<typeof replyToTicketSchema>): Promise<string> {
      try {
        await api.client.post(`/tickets/${args.ticketId}/replies`, {
          message: args.message,
        });

        return [
          '# Reply Sent',
          '',
          `Your reply has been added to ticket ${args.ticketId}.`,
          '',
          'The support team will be notified of your response.',
        ].join('\n');
      } catch (error: any) {
        return `Error replying to ticket: ${error.message}`;
      }
    },

    /**
     * Close a ticket
     */
    async close_ticket(args: z.infer<typeof getTicketSchema>): Promise<string> {
      try {
        await api.client.patch(`/tickets/${args.ticketId}/close`);

        return [
          '# Ticket Closed',
          '',
          `Ticket ${args.ticketId} has been closed.`,
          '',
          'If you need further assistance, you can create a new ticket.',
        ].join('\n');
      } catch (error: any) {
        return `Error closing ticket: ${error.message}`;
      }
    },
  };
}
