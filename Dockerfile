# Stage 1: build the jar with Maven
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -q dependency:go-offline
COPY src ./src
RUN mvn -q package -DskipTests

# Stage 2: run it on a slim JRE image
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /app/target/social-grid-0.0.1-SNAPSHOT.jar app.jar
EXPOSE 8080
# JAVA_OPTS lets production cap the heap (deploy/compose.prod.yml sets -XX:MaxRAMPercentage=75). Without a cap the JVM
# sizes itself from the whole machine's memory and can starve Postgres. exec makes java the main process, so it gets
# Docker's stop signal and shuts down cleanly.
ENV JAVA_OPTS=""
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar app.jar"]
