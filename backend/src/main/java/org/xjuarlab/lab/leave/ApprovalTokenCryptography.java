package org.xjuarlab.lab.leave;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class ApprovalTokenCryptography {
    private static final SecureRandom RANDOM = new SecureRandom();
    private final byte[] key;
    public ApprovalTokenCryptography(@Value("${lab.approval-token-encryption-key:local-development-token-key-change-before-production}") String secret) {
        try { key = MessageDigest.getInstance("SHA-256").digest(secret.getBytes(StandardCharsets.UTF_8)); }
        catch(Exception ex) { throw new IllegalStateException(ex); }
    }
    public Issued issue() {
        byte[] bytes=new byte[32]; RANDOM.nextBytes(bytes); String token=Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        return new Issued(token,hash(token),encrypt(token));
    }
    public String hash(String token) {
        try { return Base64.getUrlEncoder().withoutPadding().encodeToString(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8))); }
        catch(Exception ex) { throw new IllegalStateException(ex); }
    }
    public String decrypt(String encrypted) {
        try {
            byte[] combined=Base64.getUrlDecoder().decode(encrypted); byte[] nonce=Arrays.copyOfRange(combined,0,12); byte[] ciphertext=Arrays.copyOfRange(combined,12,combined.length);
            Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.DECRYPT_MODE,new SecretKeySpec(key,"AES"),new GCMParameterSpec(128,nonce));
            return new String(cipher.doFinal(ciphertext),StandardCharsets.UTF_8);
        } catch(Exception ex) { throw new IllegalStateException("Approval token ciphertext could not be decrypted",ex); }
    }
    private String encrypt(String token) {
        try {
            byte[] nonce=new byte[12]; RANDOM.nextBytes(nonce); Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE,new SecretKeySpec(key,"AES"),new GCMParameterSpec(128,nonce));
            byte[] encrypted=cipher.doFinal(token.getBytes(StandardCharsets.UTF_8)); byte[] combined=new byte[nonce.length+encrypted.length]; System.arraycopy(nonce,0,combined,0,nonce.length); System.arraycopy(encrypted,0,combined,nonce.length,encrypted.length);
            return Base64.getUrlEncoder().withoutPadding().encodeToString(combined);
        } catch(Exception ex) { throw new IllegalStateException("Approval token could not be encrypted",ex); }
    }
    public record Issued(String token,String hash,String encrypted){}
}
