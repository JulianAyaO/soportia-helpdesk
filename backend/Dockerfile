FROM eclipse-temurin:21-jdk-alpine AS build
WORKDIR /workspace
COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN chmod +x mvnw && ./mvnw --batch-mode dependency:go-offline
COPY src src
RUN ./mvnw --batch-mode -DskipTests package

FROM eclipse-temurin:21-jre-alpine
RUN addgroup -S soportia && adduser -S soportia -G soportia \
    && mkdir -p /app/data/attachments && chown -R soportia:soportia /app
WORKDIR /app
COPY --from=build /workspace/target/*.jar app.jar
USER soportia
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/app.jar"]
