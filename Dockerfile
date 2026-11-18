FROM node:24-alpine AS frontend
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM maven:3.9.11-eclipse-temurin-21 AS backend
WORKDIR /build/backend
COPY backend/pom.xml ./
RUN mvn -B dependency:go-offline
COPY backend/src ./src
COPY --from=frontend /build/frontend/dist/atelier/browser ./src/main/resources/static
RUN mvn -B verify

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
RUN addgroup -S atelier && adduser -S atelier -G atelier && mkdir /app/data && chown atelier:atelier /app/data
COPY --from=backend /build/backend/target/bmw-atelier-1.0.0.jar /app/app.jar
USER atelier
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
