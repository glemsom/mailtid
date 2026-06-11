# Stage 1: build TypeScript (so deploy.sh doesn't need npm locally)
FROM node:22-slim AS build
WORKDIR /build
COPY app/package.json app/package-lock.json ./
RUN npm ci
COPY app/tsconfig.json ./
COPY app/src ./src
RUN npx tsc -p tsconfig.json

# Stage 2: production runtime
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY app/package.json app/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /build/dist ./dist
COPY app/data ./data
COPY app/static ./static
COPY run.sh /run.sh
RUN chmod +x /run.sh
EXPOSE 8210
ENTRYPOINT ["/run.sh"]
