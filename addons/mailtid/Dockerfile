FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY app/package.json app/package-lock.json* ./
RUN npm ci --omit=dev
COPY app/dist ./dist
COPY app/data ./data
COPY app/static ./static
COPY run.sh /run.sh
RUN chmod +x /run.sh
EXPOSE 8210
ENTRYPOINT ["/run.sh"]
