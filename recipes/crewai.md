# CrewAI + Proxies.sx MCP

Give a CrewAI agent residential and mobile proxies through the Proxies.sx MCP server.

## Setup

```bash
pip install crewai "crewai-tools[mcp]"
```

Node.js 18 or newer must be installed: the server is started with `npx`.

## Crew with a proxy-aware agent

```python
import os
from crewai import Agent, Task, Crew
from crewai_tools import MCPServerAdapter
from mcp import StdioServerParameters

server = StdioServerParameters(
    command="npx",
    args=["-y", "@proxies-sx/mcp-server"],
    # PROXIES_API_URL is not needed
    env={"PROXIES_API_KEY": os.environ["PROXIES_API_KEY"], **os.environ},
)

with MCPServerAdapter(server) as proxy_tools:
    scraper = Agent(
        role="Web Scraper",
        goal="Fetch pages through a proxy in the right country",
        backstory="Knows how to pick a proxy pool and keep a session on one device",
        tools=proxy_tools,
    )

    scrape_task = Task(
        description="""
        1. Call pool_get_stock with the target country to see which pool has stock there.
        2. Call pool_get_my_credentials for proxyUsername and proxyPassword.
        3. Call pool_build_proxy_url with pool "peer", the country, rotation "sticky" and a sid,
           and use the returned proxyUrl for the HTTP requests.
        4. If the proxy refuses a request, pass the error text to pool_explain_error and do what it says.
        """,
        expected_output="The fetched data",
        agent=scraper,
    )

    result = Crew(agents=[scraper], tasks=[scrape_task]).kickoff()
```

The adapter API belongs to `crewai-tools`; check its documentation if your version differs.

## Tools an agent needs most

| Tool | Use when |
|------|----------|
| `pool_get_stock` | Choosing a pool and country |
| `pool_get_facets` | Targeting a city, state or carrier |
| `pool_get_my_credentials` | Getting the proxy username and password |
| `pool_build_proxy_url` | Building the proxy URL |
| `pool_explain_error` | A request through the proxy failed |
| `get_account_usage` | Checking how much traffic is left |
| `create_support_ticket` | A person has to look at it |

## Tips

- `mbl` (carrier modems) exists only in US, GB, FR, NL, PL and GE (Georgia). Use `peer` everywhere else.
- A session persists across connections only with a `sid`. Sticky holds the device, not the IP.
- You pay per GB and time is free: `get_pricing` reads the live price.
