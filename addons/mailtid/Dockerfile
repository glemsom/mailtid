FROM node:lts AS build
WORKDIR /app
COPY app/package.json app/package-lock.json* ./
RUN npm ci
COPY app/ ./
RUN npm run build && npm prune --omit=dev

FROM node:lts-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY app/data ./data
COPY app/static ./static
COPY run.sh /run.sh
RUN chmod +x /run.sh
EXPOSE 8210
ENTRYPOINT ["/run.sh"]
