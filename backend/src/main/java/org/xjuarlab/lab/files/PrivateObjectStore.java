package org.xjuarlab.lab.files;

public interface PrivateObjectStore {
    void put(String key, byte[] content);
    byte[] get(String key);
    void delete(String key);
}
