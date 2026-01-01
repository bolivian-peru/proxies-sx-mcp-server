/**
 * Reference Data API Module
 * Endpoints for countries, carriers, cities, and regions
 */

import type { ApiClient } from './client.js';
import type { Country, City, Carrier, Region, PaginatedResponse } from './types.js';

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

  /**
   * Get carriers for a country (with available device count)
   */
  async getCarriers(countryId: string, isPrivate: boolean = false): Promise<(Carrier & { freeDeviceCount?: number })[]> {
    return this.client.get<(Carrier & { freeDeviceCount?: number })[]>(
      `/v1/carriers/country/${countryId}`,
      { withDevice: 'true', isPrivate: isPrivate.toString() }
    );
  }

  /**
   * Get cities for a country (with available device count)
   */
  async getCities(countryId: string, isPrivate: boolean = false): Promise<(City & { freeDeviceCount?: number })[]> {
    return this.client.get<(City & { freeDeviceCount?: number })[]>(
      `/v1/cities/country/${countryId}`,
      { withDevice: 'true', isPrivate: isPrivate.toString() }
    );
  }

  /**
   * Get regions for a country
   */
  async getRegions(countryId: string): Promise<Region[]> {
    return this.client.get<Region[]>(`/v1/regions/country/${countryId}`);
  }

  /**
   * Get carrier by ID
   */
  async getCarrier(carrierId: string): Promise<Carrier> {
    return this.client.get<Carrier>(`/v1/carriers/${carrierId}`);
  }

  /**
   * Get city by ID
   */
  async getCity(cityId: string): Promise<City> {
    return this.client.get<City>(`/v1/cities/${cityId}`);
  }

  /**
   * Get region by ID
   */
  async getRegion(regionId: string): Promise<Region> {
    return this.client.get<Region>(`/v1/regions/${regionId}`);
  }
}
