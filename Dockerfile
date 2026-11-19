FROM node:22-alpine
WORKDIR /app
COPY server.js ./
COPY public ./public
ENV PORT=4173
EXPOSE 4173
VOLUME ["/app/data"]
CMD ["node", "server.js"]
