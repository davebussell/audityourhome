/**
 * How many local services and cities the Canadian site has, read from the generated index so the counts
 * quoted in menus, footers and page copy cannot drift from it. This file imports only the JSON (no node:fs),
 * so the header navigation and client-rendered components can use it too.
 *
 * The commercial service moved to audityourbuilding.com on 2026-11-04, so the count is 15 and the text that
 * used to say "16" now reads from here.
 */
import indexJson from '../data/local/index.json';

export const SERVICE_COUNT: number = indexJson.services.length;
export const CITY_COUNT: number = indexJson.cities.length;
