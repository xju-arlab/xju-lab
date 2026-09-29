package org.xjuarlab.lab.files;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@Profile("!prod")
@ConditionalOnProperty(name="lab.files.mode",havingValue="filesystem",matchIfMissing=true)
public class LocalPrivateObjectStore implements PrivateObjectStore {
    private final Path root;
    public LocalPrivateObjectStore(@Value("${lab.files.local-root:./data/private-files}") String root) {
        this.root = Path.of(root).toAbsolutePath().normalize();
    }
    @Override public void put(String key, byte[] content) {
        Path target = resolve(key);
        try { Files.createDirectories(target.getParent()); Files.write(target, content); }
        catch (IOException ex) { throw new IllegalStateException("Private file storage is unavailable", ex); }
    }
    @Override public byte[] get(String key) {
        try { return Files.readAllBytes(resolve(key)); }
        catch (IOException ex) { throw new IllegalStateException("Private file storage is unavailable", ex); }
    }
    @Override public void delete(String key) {
        try { Files.deleteIfExists(resolve(key)); }
        catch (IOException ex) { throw new IllegalStateException("Private file storage is unavailable", ex); }
    }
    private Path resolve(String key) {
        Path target = root.resolve(key).normalize();
        if (!target.startsWith(root)) throw new IllegalArgumentException("Invalid private object key");
        return target;
    }
}
