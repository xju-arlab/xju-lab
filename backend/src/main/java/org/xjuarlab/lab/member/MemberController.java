package org.xjuarlab.lab.member;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.xjuarlab.lab.security.CurrentMember;
import static org.springframework.http.HttpStatus.CONFLICT;

@RestController
@RequestMapping("/api/v1")
public class MemberController {
    private final JdbcTemplate jdbc; private final CurrentMember current;
    public MemberController(JdbcTemplate jdbc, CurrentMember current) { this.jdbc = jdbc; this.current = current; }

    @GetMapping("/members/me") public Profile profile(Authentication auth) {
        UUID id = current.id(auth);
        return jdbc.queryForObject("SELECT id,display_name,direction,introduction,version FROM member WHERE id=? AND active=true",
            (rs,row) -> new Profile((UUID)rs.getObject("id"),rs.getString("display_name"),rs.getString("direction"),rs.getString("introduction"),rs.getLong("version")),id);
    }

    @PatchMapping("/members/me") public Profile updateProfile(Authentication auth, @RequestHeader("If-Match-Version") long version, @Valid @RequestBody ProfileUpdate input) {
        UUID id = current.id(auth);
        int changed = jdbc.update("UPDATE member SET display_name=?,direction=?,introduction=?,version=version+1,updated_at=now() WHERE id=? AND version=? AND active=true",
            input.displayName().trim(), blankToNull(input.direction()), blankToNull(input.introduction()), id, version);
        if (changed == 0) throw new ResponseStatusException(CONFLICT,"资料版本已变化，请刷新后重试");
        return profile(auth);
    }

    @GetMapping("/members") public Page<MemberSummary> list(Authentication auth, @RequestParam(defaultValue="1") int page, @RequestParam(defaultValue="20") int pageSize) {
        UUID viewer = current.id(auth); current.roles(viewer); // resolves membership before applying the directory's safe projection
        if (page < 1 || pageSize < 1 || pageSize > 100) throw new ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST,"分页参数超出范围");
        int offset = (page - 1) * pageSize;
        var rows = jdbc.query("SELECT id,display_name,direction,cohort,student_number,contact,version FROM member WHERE active=true ORDER BY display_name,id LIMIT ? OFFSET ?",
            (rs,row) -> new MemberSummary((UUID)rs.getObject("id"),rs.getString("display_name"),rs.getString("direction"),rs.getObject("cohort",Integer.class),rs.getString("student_number"),rs.getString("contact"),rs.getLong("version")),pageSize,offset);
        var admin = current.roles(viewer).stream().anyMatch(r -> r.equals("LAB_ADMIN") || r.equals("SUPER_ADMIN"));
        if (!admin) rows = rows.stream().map(m -> new MemberSummary(m.id(),m.displayName(),m.direction(),m.cohort(),null,null,m.version())).toList();
        Long total = jdbc.queryForObject("SELECT count(*) FROM member WHERE active=true",Long.class);
        return new Page<>(rows,total == null ? 0 : total,page,pageSize);
    }

    private static String blankToNull(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    public record Profile(UUID id,String displayName,String direction,String introduction,long version) { }
    public record MemberSummary(UUID id,String displayName,String direction,Integer cohort,String studentNumber,String contact,long version) { }
    public record Page<T>(List<T> items,long total,int page,int pageSize) { }
    public record ProfileUpdate(@NotBlank @Size(max=80) String displayName,@Size(max=160) String direction,@Size(max=1000) String introduction) { }
}
