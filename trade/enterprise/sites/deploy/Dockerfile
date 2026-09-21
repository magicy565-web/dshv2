FROM node:24-bookworm AS build
WORKDIR /app
RUN npm install --global pnpm@11.7.0
COPY . .
RUN pnpm install --frozen-lockfile
RUN npm ci --prefix trade/enterprise --workspaces=false --ignore-scripts
RUN DSH_CLIENT_COMMIT_HASH="$(node -p "JSON.parse(require('fs').readFileSync('trade/upstream.json')).commit")" pnpm run build
RUN node trade/enterprise/build.mjs

FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=build /app /app
RUN mkdir /data /workspace && chown node:node /data /workspace
USER node
ENV DSH_HOME=/data
WORKDIR /workspace
ENTRYPOINT ["sh", "/app/trade/enterprise/sites/deploy/entrypoint.sh"]
