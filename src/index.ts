interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * Regrid MCP — wraps the Regrid Parcel API v2 (regrid.com)
 *
 * US/CA nationwide parcel / land / zoning / ownership data. Every parcel
 * record carries owner, mailing address, land-use description, zoning,
 * acreage, and a GeoJSON boundary.
 *
 * Tools:
 * - regrid_parcel_by_address: look up parcels matching a full address string
 * - regrid_parcel_by_point:   find parcels at a lat/lon point (optional radius)
 *
 * Auth: BYO Regrid token. Pass via _apiKey; sent as the `token` query param.
 * Get a token at regrid.com (30-day free sandbox).
 */


const BASE_URL = 'https://app.regrid.com/api/v2';

const tools: McpToolExport['tools'] = [
  {
    name: 'regrid_parcel_by_address',
    description:
      'Look up the parcel — owner, zoning, land use, boundaries — for an address. Searches Regrid\'s nationwide US/CA parcel database by full address string and returns parcel number, owner, mailing address, land use, zoning, acreage, and location. Example: regrid_parcel_by_address({ query: "1600 Pennsylvania Ave NW, Washington, DC", _apiKey: "your-token" })',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Full address string, e.g. "1600 Pennsylvania Ave NW, Washington, DC 20500"',
        },
        limit: {
          type: 'integer',
          description: 'Max parcels to return (default 5, max 20)',
        },
        _apiKey: {
          type: 'string',
          description: 'Regrid API token (get one free at regrid.com — 30-day sandbox)',
        },
      },
      required: ['query', '_apiKey'],
    },
  },
  {
    name: 'regrid_parcel_by_point',
    description:
      'Find parcels at a lat/lon point — returns the parcel(s) whose boundary contains or sits near the coordinate, with owner, zoning, land use, acreage, and boundary. Example: regrid_parcel_by_point({ lat: 38.8977, lon: -77.0365, _apiKey: "your-token" })',
    inputSchema: {
      type: 'object' as const,
      properties: {
        lat: {
          type: 'number',
          description: 'Latitude of the point, e.g. 38.8977',
        },
        lon: {
          type: 'number',
          description: 'Longitude of the point, e.g. -77.0365',
        },
        radius: {
          type: 'number',
          description: 'Optional search radius in meters around the point',
        },
        _apiKey: {
          type: 'string',
          description: 'Regrid API token (get one free at regrid.com — 30-day sandbox)',
        },
      },
      required: ['lat', 'lon', '_apiKey'],
    },
  },
];

// Shared GET helper — appends the token + params and normalizes errors.
async function regridGet(
  path: string,
  params: Record<string, string>,
  apiKey: string,
  tool: string,
): Promise<unknown> {
  if (!apiKey) {
    throw new Error(
      `${tool} requires a Regrid API token. Pass your Regrid token via _apiKey (sign up at regrid.com — 30-day free sandbox), which is sent as the \`token\` query param.`,
    );
  }
  const qs = new URLSearchParams({ token: apiKey, ...params });
  const res = await fetch(`${BASE_URL}${path}?${qs}`);
  if (!res.ok) throw new Error(`Regrid ${tool} error: HTTP ${res.status}`);
  return res.json();
}

// Regrid v2 returns GeoJSON. The observed shape is
//   { parcels: { type: "FeatureCollection", features: [ Feature ] } }
// but we walk defensively: the FeatureCollection may be at the top level, or
// under `parcels`. Each Feature carries parcel attributes under
// properties.fields, with a display string under properties.headline.
interface RegridFeature {
  properties?: {
    fields?: Record<string, unknown>;
    headline?: unknown;
    [k: string]: unknown;
  };
  geometry?: unknown;
}

function extractFeatures(data: unknown): RegridFeature[] {
  if (!data || typeof data !== 'object') return [];
  const d = data as Record<string, unknown>;

  // Preferred wrapper: { parcels: { features: [...] } }
  const parcels = d.parcels as Record<string, unknown> | undefined;
  if (parcels && Array.isArray(parcels.features)) {
    return parcels.features as RegridFeature[];
  }
  // Top-level FeatureCollection: { features: [...] }
  if (Array.isArray(d.features)) {
    return d.features as RegridFeature[];
  }
  // Last resort: `parcels` itself is already the feature array.
  if (Array.isArray(d.parcels)) {
    return d.parcels as RegridFeature[];
  }
  return [];
}

// Map one Regrid feature into a flat, LLM-friendly parcel record. Every
// attribute lives under properties.fields; keep the full first-feature
// properties around as `raw` so nothing is silently dropped.
function mapParcel(feature: RegridFeature) {
  const props = feature.properties ?? {};
  const f = (props.fields ?? {}) as Record<string, unknown>;

  return {
    parcel_number: f.parcelnumb ?? null,
    address: f.address ?? null,
    owner: f.owner ?? null,
    mail_address: f.mailadd ?? null,
    land_use: f.usedesc ?? null,
    zoning: f.zoning ?? null,
    acres: f.ll_gisacre ?? null,
    lat: f.lat ?? null,
    lon: f.lon ?? null,
    county: f.county ?? null,
    city: f.city ?? null,
    state: f.state2 ?? f.szip ?? null,
    headline: props.headline ?? null,
  };
}

async function parcelByAddress(args: Record<string, unknown>, apiKey: string) {
  const query = args.query as string | undefined;
  if (!query) {
    throw new Error(
      'regrid_parcel_by_address requires a `query` — a full address string, e.g. "1600 Pennsylvania Ave NW, Washington, DC".',
    );
  }
  const limit = Math.min(Math.max(Number(args.limit ?? 5), 1), 20);

  const data = await regridGet(
    '/parcels/address',
    { query, limit: String(limit) },
    apiKey,
    'regrid_parcel_by_address',
  );
  const features = extractFeatures(data);
  const parcels = features.map(mapParcel);

  return {
    query,
    count: parcels.length,
    parcels,
    raw: features[0]?.properties ?? null,
  };
}

async function parcelByPoint(args: Record<string, unknown>, apiKey: string) {
  const lat = args.lat;
  const lon = args.lon;
  if (lat === undefined || lat === null || lon === undefined || lon === null) {
    throw new Error(
      'regrid_parcel_by_point requires numeric `lat` and `lon` (e.g. lat: 38.8977, lon: -77.0365).',
    );
  }
  const params: Record<string, string> = { lat: String(lat), lon: String(lon) };
  if (args.radius !== undefined && args.radius !== null) {
    params.radius = String(args.radius);
  }

  const data = await regridGet('/parcels/point', params, apiKey, 'regrid_parcel_by_point');
  const features = extractFeatures(data);
  const parcels = features.map(mapParcel);

  return {
    lat,
    lon,
    count: parcels.length,
    parcels,
    raw: features[0]?.properties ?? null,
  };
}

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const apiKey = args._apiKey as string;
  delete args._apiKey;

  switch (name) {
    case 'regrid_parcel_by_address':
      return parcelByAddress(args, apiKey);
    case 'regrid_parcel_by_point':
      return parcelByPoint(args, apiKey);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// BYO-key: user's own Regrid token bears the COGS; nominal access meter.
export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
