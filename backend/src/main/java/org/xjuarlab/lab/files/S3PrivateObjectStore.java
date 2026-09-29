package org.xjuarlab.lab.files;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.core.sync.ResponseTransformer;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import java.net.URI;
import jakarta.annotation.PostConstruct;

@Component
@Profile("!test")
@ConditionalOnProperty(name="lab.files.mode",havingValue="s3")
public class S3PrivateObjectStore implements PrivateObjectStore {
    private final S3Client client;
    private final String bucket;
    public S3PrivateObjectStore(@Value("${lab.files.s3-endpoint}") String endpoint, @Value("${lab.files.s3-region:us-east-1}") String region,
        @Value("${lab.files.s3-access-key}") String accessKey, @Value("${lab.files.s3-secret-key}") String secretKey, @Value("${lab.files.s3-bucket:xju-lab-private}") String bucket) {
        this.bucket = bucket;
        this.client = S3Client.builder().endpointOverride(URI.create(endpoint)).region(Region.of(region))
            .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(accessKey, secretKey)))
            .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build()).build();
    }
    @PostConstruct public void ensurePrivateBucket() {
        try { client.headBucket(request -> request.bucket(bucket)); }
        catch (software.amazon.awssdk.services.s3.model.S3Exception ex) {
            if (ex.statusCode() != 404) throw ex;
            client.createBucket(request -> request.bucket(bucket));
        }
    }
    @jakarta.annotation.PreDestroy void close() { client.close(); }
    @Override public void put(String key, byte[] content) { client.putObject(PutObjectRequest.builder().bucket(bucket).key(key).contentType("application/pdf").build(), RequestBody.fromBytes(content)); }
    @Override public byte[] get(String key) { return client.getObject(GetObjectRequest.builder().bucket(bucket).key(key).build(), ResponseTransformer.toBytes()).asByteArray(); }
    @Override public void delete(String key) { client.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key).build()); }
}
