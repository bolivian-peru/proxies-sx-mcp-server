/**
 * Reference Data API Module
 * Where dedicated ports can be created right now, with the ids POST /v1/ports accepts
 */

import type { ApiClient } from './client.js';
import type { Country, NamedRef, WithFreeDevices } from './types.js';

export class ReferenceApi {
  constructor(private readonly client: ApiClient) {}

  /**
   * Get countries that have free dedicated-port devices
   * Required scope: ports:read
   */
  async getAvailableCountries(): Promise<WithFreeDevices<Country>[]> {
    return this.client.get<WithFreeDevices<Country>[]>('/v1/countries/with-devices', { pool: 'dedicated' });
  }

  /**
   * Get carriers with free devices in a country
   * Required scope: ports:read
   */
  async getCarriers(countryId: string): Promise<WithFreeDevices<NamedRef>[]> {
    return this.client.get<WithFreeDevices<NamedRef>[]>(`/v1/carriers/country/${countryId}`);
  }

  /**
   * Get cities with free devices in a country
   * Required scope: ports:read
   */
  async getCities(countryId: string): Promise<WithFreeDevices<NamedRef>[]> {
    return this.client.get<WithFreeDevices<NamedRef>[]>(`/v1/cities/country/${countryId}`);
  }
}
