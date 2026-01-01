/**
 * Reference Tools
 * MCP tools for countries, carriers, and locations
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
  {
    name: 'list_carriers_for_country',
    description: 'List available mobile carriers for a specific country',
    inputSchema: {
      type: 'object' as const,
      properties: {
        countryId: {
          type: 'string',
          description: 'The country ID to get carriers for',
        },
      },
      required: ['countryId'],
    },
  },
  {
    name: 'list_cities_for_country',
    description: 'List available cities for a specific country',
    inputSchema: {
      type: 'object' as const,
      properties: {
        countryId: {
          type: 'string',
          description: 'The country ID to get cities for',
        },
      },
      required: ['countryId'],
    },
  },
  {
    name: 'list_regions_for_country',
    description: 'List available regions for a specific country',
    inputSchema: {
      type: 'object' as const,
      properties: {
        countryId: {
          type: 'string',
          description: 'The country ID to get regions for',
        },
      },
      required: ['countryId'],
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

    async list_carriers_for_country(args: { countryId: string }): Promise<string> {
      try {
        const carriers = await api.reference.getCarriers(args.countryId);

        if (carriers.length === 0) {
          return 'No carriers available for this country.';
        }

        const lines = [`Available Carriers (${carriers.length}):`];
        lines.push('');

        for (const carrier of carriers) {
          const deviceInfo = carrier.freeDeviceCount !== undefined ? ` - ${carrier.freeDeviceCount} device(s)` : '';
          lines.push(`${carrier.name}${deviceInfo} - ID: ${carrier._id}`);
        }

        return lines.join('\n');
      } catch (error) {
        throw new Error(`Failed to list carriers: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async list_cities_for_country(args: { countryId: string }): Promise<string> {
      try {
        const cities = await api.reference.getCities(args.countryId);

        if (cities.length === 0) {
          return 'No cities available for this country.';
        }

        const lines = [`Available Cities (${cities.length}):`];
        lines.push('');

        for (const city of cities) {
          const deviceInfo = city.freeDeviceCount !== undefined ? ` - ${city.freeDeviceCount} device(s)` : '';
          lines.push(`${city.name}${deviceInfo} - ID: ${city._id}`);
        }

        return lines.join('\n');
      } catch (error) {
        throw new Error(`Failed to list cities: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async list_regions_for_country(args: { countryId: string }): Promise<string> {
      try {
        const regions = await api.reference.getRegions(args.countryId);

        if (regions.length === 0) {
          return 'No regions available for this country.';
        }

        const lines = [`Available Regions (${regions.length}):`];
        lines.push('');

        for (const region of regions) {
          lines.push(`${region.name} - ID: ${region._id}`);
        }

        return lines.join('\n');
      } catch (error) {
        throw new Error(`Failed to list regions: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
  list_carriers_for_country: z.object({
    countryId: z.string().min(1),
  }),
  list_cities_for_country: z.object({
    countryId: z.string().min(1),
  }),
  list_regions_for_country: z.object({
    countryId: z.string().min(1),
  }),
};
