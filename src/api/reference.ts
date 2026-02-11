/**
 * Reference Data API Module
 * Endpoints for countries (dynamic availability)
 *
 * NOTE: Cities, regions, and carriers endpoints were removed.
 * Real device availability is fetched dynamically at port creation time.
 */

import type { ApiClient } from './client.js';
import type { Country, PaginatedResponse } from './types.js';

export class ReferenceApi {
  constructor(private readonly client: ApiClient) {}

  /**
   * Get all available countries (for reference data)
   */
  async getCountries(): Promise<Country[]> {
    const response = await this.client.get<PaginatedResponse<Country>>('/v1/countries');
    return response.data;
  }

  /**
   * Get countries with available devices for port creation
   * @param isPrivate - Filter by private (true) or shared (false) devices
   */
  async getAvailableCountries(isPrivate: boolean = false): Promise<(Country & { freeDeviceCount: number })[]> {
    return this.client.get<(Country & { freeDeviceCount: number })[]>(
      `/v1/countries/with-devices`,
      { isPrivate: isPrivate.toString() }
    );
  }

  /**
   * Get country by ID
   */
  async getCountry(countryId: string): Promise<Country> {
    return this.client.get<Country>(`/v1/countries/${countryId}`);
  }
}
