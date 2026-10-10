package com.aiinvestmentcoach.backend.business;

import jakarta.validation.constraints.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import static org.springframework.http.HttpStatus.*;

@Service
public class AuthService {
    public record Register(@NotBlank @Size(max=80) String username,
        @NotBlank @Email @Size(max=254) String email, @NotNull @Size(min=12,max=128) String password) {}
    public record Login(@NotBlank @Email @Size(max=254) String email, @NotNull @Size(min=12,max=128) String password) {}
    public record Identity(String user_id, String username, String email) {}
    public record Session(String access_token, String token_type, Instant expires_at, Identity user) {}
    private final JdbcTemplate db;
    private final SecureRandom random = new SecureRandom();
    public AuthService(JdbcTemplate db) { this.db=db; }

    @Transactional
    public Session register(Register request) {
        String id="user_"+UUID.randomUUID();
        String email=request.email().strip().toLowerCase(Locale.ROOT);
        byte[] salt=new byte[16]; random.nextBytes(salt);
        String stored=Base64.getEncoder().encodeToString(salt)+":"+Base64.getEncoder().encodeToString(derive(request.password(),salt));
        db.update("INSERT INTO app_users(id,username,email,password_hash,created_at) VALUES(?,?,?,?,?)",
            id,request.username().strip(),email,stored,Timestamp.from(Instant.now()));
        return session(new Identity(id,request.username().strip(),email));
    }
    @Transactional
    public Session login(Login request) {
        var rows=db.queryForList("SELECT * FROM app_users WHERE email=?",request.email().strip().toLowerCase(Locale.ROOT));
        // Run the KDF even for unknown accounts to avoid an immediate timing difference.
        String stored=rows.isEmpty()?Base64.getEncoder().encodeToString(new byte[16])+":"+Base64.getEncoder().encodeToString(new byte[32]):(String)rows.get(0).get("password_hash");
        String[] parts=stored.split(":");
        boolean valid=MessageDigest.isEqual(derive(request.password(),Base64.getDecoder().decode(parts[0])),Base64.getDecoder().decode(parts[1]));
        if(rows.isEmpty() || !valid) throw new ResponseStatusException(UNAUTHORIZED,"Invalid email or password");
        var row=rows.get(0);
        return session(new Identity((String)row.get("id"),(String)row.get("username"),(String)row.get("email")));
    }
    public Identity authenticate(String header) {
        if(header==null || !header.matches("Bearer [A-Za-z0-9_-]{43}")) throw new ResponseStatusException(UNAUTHORIZED,"Login required");
        var users=db.query("SELECT u.id,u.username,u.email FROM auth_sessions s JOIN app_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?",
            (rs,n)->new Identity(rs.getString(1),rs.getString(2),rs.getString(3)),hash(header.substring(7)),Timestamp.from(Instant.now()));
        if(users.isEmpty()) throw new ResponseStatusException(UNAUTHORIZED,"Session expired or invalid");
        return users.get(0);
    }
    public void logout(String header) { db.update("DELETE FROM auth_sessions WHERE token_hash=?",hash(header.substring(7))); }
    private Session session(Identity user) {
        byte[] bytes=new byte[32];random.nextBytes(bytes);
        String token=Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        Instant expires=Instant.now().plusSeconds(86400);
        db.update("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",hash(token),user.user_id(),Timestamp.from(expires));
        return new Session(token,"Bearer",expires,user);
    }
    private static byte[] derive(String password,byte[] salt) {
        PBEKeySpec spec=new PBEKeySpec(password.toCharArray(),salt,210000,256);
        try { return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded(); }
        catch(GeneralSecurityException e){throw new IllegalStateException(e);} finally {spec.clearPassword();}
    }
    public static String hash(String text) {
        try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));}
        catch(GeneralSecurityException e){throw new IllegalStateException(e);}
    }
}
