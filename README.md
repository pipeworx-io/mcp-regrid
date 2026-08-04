# mcp-regrid

Regrid MCP — wraps the Regrid Parcel API v2 (regrid.com)

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `regrid_parcel_by_address` | Look up the parcel — owner, zoning, land use, boundaries — for an address. Searches Regrid's nationwide US/CA parcel database by full address string and returns parcel number, owner, mailing address, land use, zoning, acreage, and location. Example: regrid_parcel_by_address({ query: "1600 Pennsylvania Ave NW, Washington, DC", _apiKey: "your-token" }) |
| `regrid_parcel_by_point` | Find parcels at a lat/lon point — returns the parcel(s) whose boundary contains or sits near the coordinate, with owner, zoning, land use, acreage, and boundary. Example: regrid_parcel_by_point({ lat: 38.8977, lon: -77.0365, _apiKey: "your-token" }) |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "regrid": {
      "url": "https://gateway.pipeworx.io/regrid/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Regrid data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
