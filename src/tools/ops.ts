/**
 * Ops Agent Tools
 * Admin/ops tools for AI ops agents (OpenClaw/Maya): customer 360, slots,
 * capped credit, ticket replies, farmer notes, reconciliation.
 *
 * Backed by the scoped + capped + audited /v1/ops/* surface. The API key must
 * be minted by an admin with ONLY the ops:* scopes it needs (never admin:full).
 * Money writes are capped, daily-budgeted, and (above threshold) require human
 * approval — the agent gets back { status: 'pending_approval' }.
 */

import { z } from 'zod';
import type { ProxiesApi } from '../api/index.js';

export const opsToolDefinitions = [
  { name: 'ops_get_user', description: 'Customer 360 view: balance, pool-gateway usage, ports, and (if a farmer) their AI note. Requires scope ops:read.',
    inputSchema: { type: 'object' as const, properties: { userId: { type: 'string', description: 'Mongo user id' } }, required: ['userId'] } },
  { name: 'ops_get_user_audit', description: 'Recent ops-agent actions taken on this user. Scope ops:read.',
    inputSchema: { type: 'object' as const, properties: { userId: { type: 'string' }, limit: { type: 'number' } }, required: ['userId'] } },
  { name: 'ops_reconcile_payments', description: 'Read-only Stripe-vs-DB payment view for a user (confirmed total + pending). Scope ops:payments:read.',
    inputSchema: { type: 'object' as const, properties: { userId: { type: 'string' } }, required: ['userId'] } },
  { name: 'ops_list_tickets', description: 'List support tickets (admin view). Optional status filter. Scope ops:tickets.',
    inputSchema: { type: 'object' as const, properties: { status: { type: 'string' }, limit: { type: 'number' } }, required: [] } },
  { name: 'ops_reply_ticket', description: 'Post an admin reply to a ticket, optionally emailing the customer. Scope ops:tickets. A reason is required.',
    inputSchema: { type: 'object' as const, properties: { ticketId: { type: 'string' }, message: { type: 'string' }, sendEmail: { type: 'boolean' }, reason: { type: 'string' } }, required: ['ticketId', 'message', 'reason'] } },
  { name: 'ops_set_slots', description: 'Set a user\'s shared/private port slot limits (capped). Scope ops:slots. A reason is required.',
    inputSchema: { type: 'object' as const, properties: { userId: { type: 'string' }, sharedSlotLimit: { type: 'number' }, privateSlotLimit: { type: 'number' }, reason: { type: 'string' } }, required: ['userId', 'reason'] } },
  { name: 'ops_credit_balance', description: 'Credit a user\'s balance in USD (admin credit). Capped per-action + daily budget; amounts above the auto cap return { status: pending_approval } for a human. Scope ops:credit. A reason is required.',
    inputSchema: { type: 'object' as const, properties: { userId: { type: 'string' }, amountUsd: { type: 'number' }, reason: { type: 'string' } }, required: ['userId', 'amountUsd', 'reason'] } },
  { name: 'ops_email_user', description: 'Send a personalized email to one user (hourly rate-capped). Scope ops:email. A reason is required.',
    inputSchema: { type: 'object' as const, properties: { userId: { type: 'string' }, subject: { type: 'string' }, content: { type: 'string' }, reason: { type: 'string' } }, required: ['userId', 'subject', 'content', 'reason'] } },
  { name: 'ops_list_farmers', description: 'List farmer AI notes (shared operational memory). Scope ops:farmers.',
    inputSchema: { type: 'object' as const, properties: { limit: { type: 'number' } }, required: [] } },
  { name: 'ops_get_farmer', description: 'Farmer fleet funnel (total/online/verified/listed/routable) + AI note. Scope ops:farmers.',
    inputSchema: { type: 'object' as const, properties: { farmerId: { type: 'string' } }, required: ['farmerId'] } },
  { name: 'ops_write_farmer_note', description: 'Write/append a farmer AI note (situation, nextAction, free note) — shared with future AI sessions. Scope ops:notes. A reason is required.',
    inputSchema: { type: 'object' as const, properties: { farmerId: { type: 'string' }, situation: { type: 'string' }, nextAction: { type: 'string' }, note: { type: 'string' }, reason: { type: 'string' } }, required: ['farmerId', 'reason'] } },
] as const;

export const opsSchemas = {
  ops_get_user: z.object({ userId: z.string() }),
  ops_get_user_audit: z.object({ userId: z.string(), limit: z.number().optional() }),
  ops_reconcile_payments: z.object({ userId: z.string() }),
  ops_list_tickets: z.object({ status: z.string().optional(), limit: z.number().optional() }),
  ops_reply_ticket: z.object({ ticketId: z.string(), message: z.string(), sendEmail: z.boolean().optional(), reason: z.string() }),
  ops_set_slots: z.object({ userId: z.string(), sharedSlotLimit: z.number().optional(), privateSlotLimit: z.number().optional(), reason: z.string() }),
  ops_credit_balance: z.object({ userId: z.string(), amountUsd: z.number(), reason: z.string() }),
  ops_email_user: z.object({ userId: z.string(), subject: z.string(), content: z.string(), reason: z.string() }),
  ops_list_farmers: z.object({ limit: z.number().optional() }),
  ops_get_farmer: z.object({ farmerId: z.string() }),
  ops_write_farmer_note: z.object({ farmerId: z.string(), situation: z.string().optional(), nextAction: z.string().optional(), note: z.string().optional(), reason: z.string() }),
};

export function createOpsToolHandlers(api: ProxiesApi) {
  const out = (r: unknown) => JSON.stringify(r, null, 2);
  const err = (e: unknown) => `Error: ${e instanceof Error ? e.message : String(e)}`;
  return {
    async ops_get_user(a: { userId: string }) { try { return out(await api.client.get(`/v1/ops/users/${a.userId}`)); } catch (e) { return err(e); } },
    async ops_get_user_audit(a: { userId: string; limit?: number }) { try { return out(await api.client.get(`/v1/ops/users/${a.userId}/audit`, a.limit ? { limit: a.limit } : undefined)); } catch (e) { return err(e); } },
    async ops_reconcile_payments(a: { userId: string }) { try { return out(await api.client.get(`/v1/ops/payments/reconcile/${a.userId}`)); } catch (e) { return err(e); } },
    async ops_list_tickets(a: { status?: string; limit?: number }) { try { return out(await api.client.get(`/v1/ops/tickets`, { status: a.status, limit: a.limit })); } catch (e) { return err(e); } },
    async ops_reply_ticket(a: { ticketId: string; message: string; sendEmail?: boolean; reason: string }) { try { return out(await api.client.post(`/v1/ops/tickets/${a.ticketId}/reply`, { message: a.message, sendEmail: a.sendEmail, reason: a.reason })); } catch (e) { return err(e); } },
    async ops_set_slots(a: { userId: string; sharedSlotLimit?: number; privateSlotLimit?: number; reason: string }) { try { return out(await api.client.post(`/v1/ops/users/${a.userId}/slots`, { sharedSlotLimit: a.sharedSlotLimit, privateSlotLimit: a.privateSlotLimit, reason: a.reason })); } catch (e) { return err(e); } },
    async ops_credit_balance(a: { userId: string; amountUsd: number; reason: string }) { try { return out(await api.client.post(`/v1/ops/users/${a.userId}/credit`, { amountUsd: a.amountUsd, reason: a.reason })); } catch (e) { return err(e); } },
    async ops_email_user(a: { userId: string; subject: string; content: string; reason: string }) { try { return out(await api.client.post(`/v1/ops/users/${a.userId}/email`, { subject: a.subject, content: a.content, reason: a.reason })); } catch (e) { return err(e); } },
    async ops_list_farmers(a: { limit?: number }) { try { return out(await api.client.get(`/v1/ops/farmers`, a.limit ? { limit: a.limit } : undefined)); } catch (e) { return err(e); } },
    async ops_get_farmer(a: { farmerId: string }) { try { return out(await api.client.get(`/v1/ops/farmers/${a.farmerId}`)); } catch (e) { return err(e); } },
    async ops_write_farmer_note(a: { farmerId: string; situation?: string; nextAction?: string; note?: string; reason: string }) { try { return out(await api.client.post(`/v1/ops/farmers/${a.farmerId}/note`, { situation: a.situation, nextAction: a.nextAction, note: a.note, reason: a.reason })); } catch (e) { return err(e); } },
  };
}
