package org.xjuarlab.lab.member;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PutMapping;
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
    private static final TypeReference<List<String>> DIRECTIONS_TYPE = new TypeReference<>() { };
    private final JdbcTemplate jdbc;
    private final CurrentMember current;
    private final ObjectMapper mapper;

    public MemberController(JdbcTemplate jdbc, CurrentMember current, ObjectMapper mapper) {
        this.jdbc = jdbc; this.current = current; this.mapper = mapper;
    }

    @GetMapping("/members/me") public Profile profile(Authentication auth) { return profile(current.id(auth)); }

    @PutMapping("/members/me/registration") @Transactional
    public Profile register(Authentication auth, @RequestHeader("If-Match-Version") long version,
            @Valid @RequestBody RegistrationInput input) {
        UUID id = current.id(auth);
        var saved = jdbc.query("SELECT real_name,student_number,version,(real_name IS NOT NULL AND student_number IS NOT NULL AND class_name IS NOT NULL AND jsonb_array_length(directions)>0) AS registration_complete FROM member WHERE id=? AND active=true FOR UPDATE",
            (rs, row) -> new Object[] { rs.getString("real_name"), rs.getString("student_number"), rs.getLong("version"), rs.getBoolean("registration_complete") }, id);
        if (saved.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "成员不存在");
        Object[] row = saved.getFirst();
        if ((boolean) row[3]) throw new ResponseStatusException(CONFLICT, "实名注册已完成；班级和研究方向可在个人资料中修改");
        if ((long) row[2] != version) throw new ResponseStatusException(CONFLICT, "资料版本已变化，请刷新后重试");
        String realName = clean(input.realName());
        String studentNumber = clean(input.studentNumber());
        if (row[0] != null && !row[0].equals(realName)) throw new ResponseStatusException(CONFLICT, "实名信息已登记，只能由超级管理员修改");
        if (row[1] != null && !row[1].equals(studentNumber)) throw new ResponseStatusException(CONFLICT, "学号已登记，只能由超级管理员修改");
        MemberClass memberClass = parseClass(input.className());
        List<String> directions = normalizeDirections(input.directions());
        String directionsJson = json(directions);
        jdbc.update("""
            UPDATE member SET real_name=COALESCE(real_name,?), student_number=COALESCE(student_number,?),
              display_name=COALESCE(real_name,?), class_name=?, cohort=?, directions=?::jsonb, direction=?,
              version=version+1,updated_at=now()
            WHERE id=? AND version=? AND active=true
            """, realName, studentNumber, realName, memberClass.value(), memberClass.grade(), directionsJson,
            String.join("、", directions), id, version);
        return profile(id);
    }

    @PatchMapping("/members/me") @Transactional
    public Profile updateProfile(Authentication auth, @RequestHeader("If-Match-Version") long version,
            @Valid @RequestBody ProfileUpdate input) {
        UUID id = current.id(auth);
        MemberClass memberClass = parseClass(input.className());
        List<String> directions = normalizeDirections(input.directions());
        int changed = jdbc.update("""
            UPDATE member SET class_name=?,cohort=?,directions=?::jsonb,direction=?,introduction=?,
              version=version+1,updated_at=now()
            WHERE id=? AND version=? AND active=true AND real_name IS NOT NULL AND student_number IS NOT NULL
            """, memberClass.value(), memberClass.grade(), json(directions), String.join("、", directions),
            blankToNull(input.introduction()), id, version);
        if (changed == 0) throw new ResponseStatusException(CONFLICT, "资料版本已变化或请先完成实名注册");
        return profile(id);
    }

    @GetMapping("/members") public Page<MemberSummary> list(Authentication auth, @RequestParam(defaultValue="1") int page, @RequestParam(defaultValue="20") int pageSize) {
        UUID viewer = current.id(auth); current.roles(viewer);
        if (page < 1 || pageSize < 1 || pageSize > 100) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"分页参数超出范围");
        int offset = (page - 1) * pageSize;
        var rows = jdbc.query("SELECT id,display_name,direction,class_name,cohort,student_number,contact,version FROM member WHERE active=true ORDER BY display_name,id LIMIT ? OFFSET ?",
            (rs,row) -> new MemberSummary((UUID)rs.getObject("id"),rs.getString("display_name"),rs.getString("direction"),rs.getString("class_name"),rs.getObject("cohort",Integer.class),rs.getString("student_number"),rs.getString("contact"),rs.getLong("version")),pageSize,offset);
        var admin = current.roles(viewer).stream().anyMatch(r -> r.equals("LAB_ADMIN") || r.equals("SUPER_ADMIN"));
        if (!admin) rows = rows.stream().map(m -> new MemberSummary(m.id(),m.displayName(),m.direction(),m.className(),m.cohort(),null,null,m.version())).toList();
        Long total = jdbc.queryForObject("SELECT count(*) FROM member WHERE active=true",Long.class);
        return new Page<>(rows,total == null ? 0 : total,page,pageSize);
    }

    private Profile profile(UUID id) {
        return jdbc.queryForObject("""
            SELECT id,display_name,real_name,student_number,class_name,cohort,directions::text AS directions_json,
              direction,introduction,version,
              (real_name IS NOT NULL AND student_number IS NOT NULL AND class_name IS NOT NULL AND jsonb_array_length(directions)>0) AS registration_complete
            FROM member WHERE id=? AND active=true
            """, (rs,row) -> new Profile((UUID)rs.getObject("id"),rs.getString("display_name"),rs.getString("real_name"),
            rs.getString("student_number"),rs.getString("class_name"),rs.getObject("cohort",Integer.class),
            parseDirections(rs.getString("directions_json")),rs.getString("direction"),rs.getString("introduction"),
            rs.getLong("version"),rs.getBoolean("registration_complete")),id);
    }

    private List<String> parseDirections(String json) {
        try { return mapper.readValue(json, DIRECTIONS_TYPE); }
        catch (Exception e) { throw new IllegalStateException("Stored member directions are invalid", e); }
    }
    private String json(List<String> directions) {
        try { return mapper.writeValueAsString(directions); }
        catch (Exception e) { throw new IllegalStateException("Could not serialize member directions", e); }
    }
    private static List<String> normalizeDirections(List<String> values) {
        if (values == null || values.isEmpty() || values.size() > 8) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"至少选择一个方向，最多八个");
        LinkedHashSet<String> unique = new LinkedHashSet<>();
        for (String value : values) {
            String direction = clean(value);
            if (direction.length() > 32 || direction.chars().anyMatch(Character::isISOControl) || direction.contains("、"))
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"方向不可超过 32 个字符或包含分隔符");
            unique.add(direction);
        }
        if (unique.size() != values.size()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"研究方向不能重复");
        return new ArrayList<>(unique);
    }
    private static MemberClass parseClass(String value) {
        try { return MemberClass.parse(value); }
        catch (IllegalArgumentException e) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST,e.getMessage()); }
    }
    private static String clean(String value) { return value == null ? "" : value.trim(); }
    private static String blankToNull(String value) { return value == null || value.isBlank() ? null : value.trim(); }

    public record Profile(UUID id,String displayName,String realName,String studentNumber,String className,Integer grade,
            List<String> directions,String direction,String introduction,long version,boolean registrationComplete) { }
    public record MemberSummary(UUID id,String displayName,String direction,String className,Integer cohort,String studentNumber,String contact,long version) { }
    public record Page<T>(List<T> items,long total,int page,int pageSize) { }
    public record RegistrationInput(@NotBlank @Size(max=80) String realName,@NotBlank @Size(max=32) String studentNumber,
            @NotBlank @Size(max=32) String className,@NotEmpty @Size(max=8) List<@NotBlank @Size(max=32) String> directions) { }
    public record ProfileUpdate(@NotBlank @Size(max=32) String className,@NotEmpty @Size(max=8) List<@NotBlank @Size(max=32) String> directions,
            @Size(max=1000) String introduction) { }
}
