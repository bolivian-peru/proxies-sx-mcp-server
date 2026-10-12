# @proxies-sx/mcp-server — stdio MCP server in a container.
#
#   docker build -t proxies-sx-mcp .
#   docker run -i --rm -e PROXIES_API_KEY=psx_... proxies-sx-mcp
#
# Environment (all optional, at least one auth variable is needed):
#   PROXIES_API_KEY    psx_ API key from https://client.proxies.sx/account (API-key mode)
#   AGENT_WALLET_KEY   private key of a USDC wallet on Base (optional x402 wallet mode, no account)
#   PROXIES_API_URL    API base URL (default https://api.proxies.sx; a trailing /v1 is accepted)

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY README.md LICENSE llm.txt SKILL.md server.json tools.json ./
USER node
CMD ["node", "dist/index.js"]
