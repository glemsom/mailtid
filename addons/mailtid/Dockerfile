FROM node:lts-alpine AS build
WORKDIR /app
RUN apk add --no-cache python3 make g++ libc6-compat
COPY app/package.json app/package-lock.json* ./
RUN npm ci
COPY app/ ./
RUN npm run build && npm prune --omit=dev

FROM node:lts-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache libc6-compat tini
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY app/data ./data
COPY app/static ./static
COPY run.sh /run.sh
RUN chmod +x /run.sh
EXPOSE 8200
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/run.sh"]
