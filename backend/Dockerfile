FROM eclipse-temurin:21-jdk-jammy AS build
WORKDIR /workspace
COPY . .
ARG MAVEN_VERSION=3.9.12
ARG MAVEN_SHA256=305773a68d6ddfd413df58c82b3f8050e89778e777f3a745c8e5b8cbea4018ef
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl unzip \
    && rm -rf /var/lib/apt/lists/* \
    && curl --fail --location --silent --show-error --retry 3 --retry-all-errors \
      "https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/${MAVEN_VERSION}/apache-maven-${MAVEN_VERSION}-bin.zip" \
      --output /tmp/apache-maven.zip \
    && echo "${MAVEN_SHA256}  /tmp/apache-maven.zip" | sha256sum --check --status \
    && unzip -q /tmp/apache-maven.zip -d /opt \
    && rm /tmp/apache-maven.zip \
    && "/opt/apache-maven-${MAVEN_VERSION}/bin/mvn" -B -DskipTests package

FROM eclipse-temurin:21-jre-jammy
WORKDIR /app
RUN groupadd --system app && useradd --system --gid app --home-dir /app app \
    && apt-get update && apt-get install -y --no-install-recommends python3 python3-venv \
    && rm -rf /var/lib/apt/lists/* && python3 -m venv /opt/ssh \
    && mkdir -p /app/ssh-state /app/ssh-config && chown app:app /app/ssh-state
COPY ssh-helper /app/ssh-helper
RUN /opt/ssh/bin/pip install --no-cache-dir -r /app/ssh-helper/requirements.txt
COPY --from=build /workspace/target/xju-lab-backend-0.1.0-SNAPSHOT.jar /app/app.jar
USER app
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=70", "-jar", "/app/app.jar"]
