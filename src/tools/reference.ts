/**
 * Reference Tools
 * MCP tools for countries (dynamic availability data)
 *
 * NOTE: Cities, regions, and carriers were removed as they contain
 * static/stale data. Real device availability is fetched dynamically
 * at port creation time from the backend.
 */

import { z } from 'zod';
import type { ProxiesApi } from '../api/index.js';

/**
 * Tool definitions for reference data
 */
export const referenceToolDefinitions = [
  {
    name: 'list_available_countries',
    description: 'List countries where proxy ports can be created (only shows countries with available devices)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        isPrivate: {
          type: 'boolean',
          description: 'Filter for private devices (true) or shared devices (false). Default: false (shared)',
        },
      },
      required: [] as string[],
    },
  },
] as const;

/**
 * Reference tools handler
 */
export function createReferenceToolHandlers(api: ProxiesApi) {
  return {
    async list_available_countries(args: { isPrivate?: boolean } = {}): Promise<string> {
      try {
        const isPrivate = args.isPrivate ?? false;
        const countries = await api.reference.getAvailableCountries(isPrivate);

        if (countries.length === 0) {
          return `No countries available for ${isPrivate ? 'private' : 'shared'} ports. This means no devices have available slots.`;
        }

        const portType = isPrivate ? 'Private' : 'Shared';
        const lines = [`Available Countries for ${portType} Ports (${countries.length}):`];
        lines.push('');

        for (const country of countries) {
          const flag = country.flag || '';
          lines.push(`${flag} ${country.name} (${country.code}) - ${country.freeDeviceCount} device(s) available - ID: ${country._id}`);
        }

        return lines.join('\n');
      } catch (error) {
        throw new Error(`Failed to list countries: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
  };
}

/**
 * Zod schemas for validation
 */
export const referenceSchemas = {
  list_available_countries: z.object({
    isPrivate: z.boolean().optional(),
  }),
};
