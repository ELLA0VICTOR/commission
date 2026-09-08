FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
# No OS keyring: Binance CLI uses its encrypted per-studio directory fallback.
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build
ENV NODE_ENV=production
ENV PORT=10000
EXPOSE 10000
CMD ["node", "--import", "tsx", "server/index.ts"]
