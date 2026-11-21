# Proxies.sx plugin for Claude Code

Residential and mobile proxies for AI agents. The plugin connects Claude Code to the hosted Proxies.sx MCP server at `https://api.proxies.sx/mcp` and adds a short skill on picking pools, sticky sessions and gateway errors.

## What you get

- Without an API key: live stock per country, the proxy URL format, error explanations and service status.
- With an API key: your proxy credentials, ready proxy URLs, usage, top-ups, Private modems with IP rotation, and support tickets.

## Setup

Install the plugin from the Claude Code plugin directory, or in Claude Code run:

```
/plugin install proxies-sx --marketplace bolivian-peru/proxies-sx-mcp-server
```

For the steps, see the official guide: https://code.claude.com/docs/en/plugins/install

When the plugin is enabled, Claude Code asks for your Proxies.sx API key. Create one at https://client.proxies.sx/account. The key is stored in your system's secure credential store and sent to the server as an `Authorization: Bearer` header. Leave it empty to use only the public tools.

## Files

- `.claude-plugin/plugin.json`: plugin manifest with the remote MCP server and the API key option.
- `skills/proxies-sx/SKILL.md`: usage notes for Claude.

## Links

- Documentation: https://agents.proxies.sx/mcp/
- Prices: https://api.proxies.sx/v1/pricing
- Support: https://client.proxies.sx/tickets
- Privacy: https://www.proxies.sx/privacy
- Terms: https://www.proxies.sx/terms
- Server source: https://github.com/bolivian-peru/proxies-sx-mcp-server

License: MIT
