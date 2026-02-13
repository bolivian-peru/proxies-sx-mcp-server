# CrewAI + Proxies.sx MCP

Use mobile proxies in CrewAI agents for web scraping and data collection.

## Setup

```bash
pip install crewai crewai-tools
npm install -g @proxies-sx/mcp-server
```

## Configure MCP Server

Add to your CrewAI project's MCP config:

```yaml
# mcp_servers.yaml
proxies-sx:
  command: npx
  args: ["-y", "@proxies-sx/mcp-server"]
  env:
    PROXIES_API_KEY: "psx_your_key_here"
    PROXIES_API_URL: "https://api.proxies.sx/v1"
```

## Crew with Proxy Agent

```python
from crewai import Agent, Task, Crew
from crewai_tools import MCPTool

# Initialize MCP tools
proxy_tools = MCPTool(
    server_name="proxies-sx",
    command="npx",
    args=["-y", "@proxies-sx/mcp-server"],
    env={
        "PROXIES_API_KEY": "psx_your_key_here",
        "PROXIES_API_URL": "https://api.proxies.sx/v1",
    },
)

# Create scraping agent
scraper = Agent(
    role="Web Scraper",
    goal="Scrape websites using mobile proxies to avoid blocks",
    backstory="Expert at bypassing anti-bot systems using mobile IP rotation",
    tools=[proxy_tools],
)

# Create scraping task
scrape_task = Task(
    description="""
    1. Use create_port to get a US mobile proxy (country: US, tier: shared)
    2. Use get_proxy_connection_string to get the HTTP proxy URL
    3. Scrape the target website using the proxy
    4. If blocked, use rotate_port to get a new IP
    5. Delete the port when done
    """,
    expected_output="Scraped data from the target website",
    agent=scraper,
)

crew = Crew(agents=[scraper], tasks=[scrape_task])
result = crew.kickoff()
```

## Key Tools for CrewAI

| Tool | Use When |
|------|----------|
| `create_port` | Start a scraping session |
| `get_proxy_connection_string` | Get proxy URL for HTTP client |
| `rotate_port` | Rotate IP when blocked |
| `get_port_ip` | Verify current IP |
| `delete_port` | Clean up when done |
| `list_available_countries` | Check country availability |

## Tips

- Use `shared` tier for cost-effective scraping ($4/GB)
- Rotate IP between requests to avoid fingerprinting
- Check `get_port_status` before scraping to ensure proxy is online
- Use `configure_auto_rotation` for hands-free IP rotation
