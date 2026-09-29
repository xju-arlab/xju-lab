package org.xjuarlab.lab.files;

import static org.assertj.core.api.Assertions.assertThat;
import java.time.Duration;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

@Testcontainers
class S3PrivateObjectStoreTest {
    private static final String ACCESS_KEY="xju-test-access-key";
    private static final String SECRET_KEY="xju-test-secret-key-for-rustfs";
    @Container static final GenericContainer<?> objectStore=new GenericContainer<>(DockerImageName.parse("rustfs/rustfs:1.0.0"))
        .withExposedPorts(9000,9001)
        .withEnv("RUSTFS_ACCESS_KEY",ACCESS_KEY)
        .withEnv("RUSTFS_SECRET_KEY",SECRET_KEY)
        .withEnv("RUSTFS_ADDRESS","0.0.0.0:9000")
        .withEnv("RUSTFS_CONSOLE_ADDRESS","0.0.0.0:9001")
        .withEnv("RUSTFS_CONSOLE_ENABLE","true")
        .withCommand("/data")
        .waitingFor(Wait.forHttp("/health").forPort(9000).forStatusCode(200).withStartupTimeout(Duration.ofSeconds(90)));

    @Test void putsGetsAndDeletesPrivateObjectsThroughS3Api() {
        String bucket="xju-test-"+UUID.randomUUID().toString().replace("-","");
        try(S3StoreFixture store=new S3StoreFixture(new S3PrivateObjectStore("http://"+objectStore.getHost()+":"+objectStore.getMappedPort(9000),"us-east-1",ACCESS_KEY,SECRET_KEY,bucket))) {
            byte[] content="private test object".getBytes(java.nio.charset.StandardCharsets.UTF_8);
            store.value().ensurePrivateBucket();
            store.value().put("private/test-object",content);
            assertThat(store.value().get("private/test-object")).containsExactly(content);
            store.value().delete("private/test-object");
        }
    }
    private record S3StoreFixture(S3PrivateObjectStore value) implements AutoCloseable { @Override public void close(){value.close();} }
}
