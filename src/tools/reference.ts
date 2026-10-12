/**
 * Reference Tools
 * MCP tools for dedicated-port availability (countries, carriers and cities
 * that have a free carrier modem right now)
 */

import { z } from 'zod';
import type { ProxiesApi } from '../api/index.js';
import type { NamedRef, WithFreeDevices } from '../api/index.js';
import { readOnly } from './annotations.js';

/**
 * Tool definitions for reference data
 */
export const referenceToolDefinitions = [
  {
    name: 'list_available_countries',
    annotations: readOnly('List Available Countries'),
    description: 'List the countries where a dedicated port can be created right now, with the countryId create_port needs. Dedicated ports run on carrier modems, which exist only in US, GB, FR, NL, PL and GE (Georgia); for every other country use the Pool Gateway (pool_get_stock, pool_build_proxy_url). Pass countryId to also list the carriers and cities there with their ids. Scope ports:read.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        countryId: {
          type: 'string',
          description: 'Optional countryId from this tool: also list carriers and cities with free devices in that country',
        },
      },
      required: [] as string[],
    },
  },
] as const;

function formatRefs(title: string, rows: WithFreeDevices<NamedRef>[]): string[] {
  if (rows.length === 0) return [`${title}: none with a free device`];
  return [`${title}:`, ...rows.map(r => `  ${r.name} - ${r.freeDeviceCount} free device(s) - id: ${r._id}`)];
}

/**
 * Reference tools handler
 */
export function createReferenceToolHandlers(api: ProxiesApi) {
  return {
    async list_available_countries(args: { countryId?: string } = {}): Promise<string> {
      try {
        const countries = await api.reference.getAvailableCountries();

        if (countries.length === 0) {
          return 'No country has a free dedicated-port device right now. The Pool Gateway may still have stock: see pool_get_stock.';
        }

        const lines = ['Countries with a free dedicated-port device:', ''];
        for (const country of countries) {
          lines.push(`${country.name} (${country.code}) - ${country.freeDeviceCount} free device(s) - countryId: ${country._id}`);
        }

        if (args.countryId) {
          const [carriers, cities] = await Promise.all([
            api.reference.getCarriers(args.countryId),
            api.reference.getCities(args.countryId),
          ]);
          lines.push('', ...formatRefs('Carriers (carrierId)', carriers), '', ...formatRefs('Cities (cityId)', cities));
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
    countryId: z.string().optional(),
  }),
};
