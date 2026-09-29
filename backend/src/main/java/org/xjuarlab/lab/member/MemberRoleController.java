package org.xjuarlab.lab.member;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.xjuarlab.lab.security.CurrentMember;
import static org.springframework.http.HttpStatus.CONFLICT;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@RestController
@RequestMapping("/api/v1/admin/members")
public class MemberRoleController {
    private final JdbcTemplate jdbc; private final CurrentMember current;
    public MemberRoleController(JdbcTemplate jdbc,CurrentMember current){this.jdbc=jdbc;this.current=current;}

    @PutMapping("/{memberId}/roles/{role}") @Transactional
    public RoleChange change(Authentication auth,@PathVariable UUID memberId,@PathVariable String role,@Valid @RequestBody RoleChangeRequest body){
        UUID actor=current.id(auth); boolean superAdmin=role.equals("SUPER_ADMIN");
        current.requireRole(actor,superAdmin?new String[]{"SUPER_ADMIN"}:new String[]{"LAB_ADMIN","SUPER_ADMIN"});
        if(!java.util.Set.of("TEACHER","LAB_ADMIN","SUPER_ADMIN").contains(role)) throw new ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST,"角色无效");
        var target=jdbc.query("SELECT version,active FROM member WHERE id=? FOR UPDATE",(rs,row)->new Object[]{rs.getLong(1),rs.getBoolean(2)},memberId);
        if(target.isEmpty()||!(boolean)target.getFirst()[1]) throw new ResponseStatusException(NOT_FOUND,"成员不存在");
        if((long)target.getFirst()[0]!=body.version()) throw new ResponseStatusException(CONFLICT,"成员版本已变化，请刷新后重试");
        int changed=jdbc.update("UPDATE member SET version=version+1,updated_at=now() WHERE id=? AND version=?",memberId,body.version());
        if(changed==0) throw new ResponseStatusException(CONFLICT,"成员版本已变化，请刷新后重试");
        boolean before=hasRole(memberId,role);
        boolean managed=!jdbc.query("SELECT 1 FROM role_assignment WHERE member_id=? AND role=? AND source IN ('labos-admin','bootstrap') AND revoked_at IS NULL",(rs,row)->rs.getInt(1),memberId,role).isEmpty();
        if(body.granted()&&!before) jdbc.update("INSERT INTO role_assignment(member_id,role,source,granted_by) VALUES (?,?, 'labos-admin',?)",memberId,role,actor);
        if(!body.granted()&&managed){
            boolean otherSource=!jdbc.query("SELECT 1 FROM role_assignment WHERE member_id=? AND role=? AND source NOT IN ('labos-admin','bootstrap') AND revoked_at IS NULL",(rs,row)->rs.getInt(1),memberId,role).isEmpty();
            if(superAdmin&&!otherSource){
                Integer others=jdbc.queryForObject("SELECT count(DISTINCT r.member_id) FROM role_assignment r JOIN member m ON m.id=r.member_id WHERE r.role='SUPER_ADMIN' AND r.member_id<>? AND r.revoked_at IS NULL AND m.active=true",Integer.class,memberId);
                if(others==null||others==0) throw new ResponseStatusException(CONFLICT,"不能撤销最后一位有效超级管理员");
            }
            jdbc.update("UPDATE role_assignment SET revoked_at=now(),version=version+1 WHERE member_id=? AND role=? AND source IN ('labos-admin','bootstrap') AND revoked_at IS NULL",memberId,role);
        }
        boolean after=hasRole(memberId,role);
        Long version=jdbc.queryForObject("SELECT version FROM member WHERE id=?",Long.class,memberId);
        if(superAdmin&&after!=before){
            boolean desired=after;
            jdbc.update("INSERT INTO external_role_sync(member_id,desired,version,confirmed_version,status) VALUES (?,?,1,0,'PENDING') ON CONFLICT(member_id) DO UPDATE SET desired=excluded.desired,version=external_role_sync.version+1,status='PENDING',updated_at=now()",memberId,desired);
            Long syncVersion=jdbc.queryForObject("SELECT version FROM external_role_sync WHERE member_id=?",Long.class,memberId);
            jdbc.update("INSERT INTO outbox_event(event_type,aggregate_id,payload) VALUES ('OJ_ADMIN_ROLE_SYNC',?,jsonb_build_object('memberId',?::text,'desired',?,'version',?))",memberId,memberId,desired,syncVersion);
        }
        jdbc.update("INSERT INTO audit_event(actor_id,action,target_type,target_id,after_summary) VALUES (?,?, 'member',?,jsonb_build_object('role',?,'granted',?,'version',?))",actor,after?"GRANT_ROLE":"REVOKE_ROLE",memberId.toString(),role,after,version);
        return new RoleChange(memberId,role,after,version);
    }
    @PatchMapping("/{memberId}/status") @Transactional
    public MemberStatus status(Authentication auth,@PathVariable UUID memberId,@Valid @RequestBody MemberStatusRequest body){
        UUID actor=current.id(auth);current.requireRole(actor,"LAB_ADMIN","SUPER_ADMIN");
        var target=jdbc.query("SELECT version,active FROM member WHERE id=? FOR UPDATE",(rs,row)->new Object[]{rs.getLong(1),rs.getBoolean(2)},memberId);
        if(target.isEmpty())throw new ResponseStatusException(NOT_FOUND,"成员不存在");
        long oldVersion=(long)target.getFirst()[0];boolean wasActive=(boolean)target.getFirst()[1];
        if(oldVersion!=body.version())throw new ResponseStatusException(CONFLICT,"成员版本已变化，请刷新后重试");
        boolean hadSuperAdmin=wasActive&&hasRole(memberId,"SUPER_ADMIN");
        if(wasActive&&!body.active()&&hadSuperAdmin){
            Integer others=jdbc.queryForObject("SELECT count(DISTINCT r.member_id) FROM role_assignment r JOIN member m ON m.id=r.member_id WHERE r.role='SUPER_ADMIN' AND r.member_id<>? AND r.revoked_at IS NULL AND m.active=true",Integer.class,memberId);
            if(others==null||others==0)throw new ResponseStatusException(CONFLICT,"不能停用最后一位有效超级管理员");
        }
        jdbc.update("UPDATE member SET active=?,version=version+1,updated_at=now() WHERE id=? AND version=?",body.active(),memberId,body.version());
        jdbc.update("UPDATE external_identity SET active=? WHERE member_id=?",body.active(),memberId);
        if(!body.active())jdbc.update("UPDATE role_assignment SET revoked_at=now(),version=version+1 WHERE member_id=? AND revoked_at IS NULL",memberId);
        else jdbc.update("INSERT INTO role_assignment(member_id,role,source) VALUES (?,'MEMBER','oidc-admission') ON CONFLICT DO NOTHING",memberId);
        if(hadSuperAdmin&&!body.active())queueOjRoleSync(memberId,false);
        if(!body.active())jdbc.update("INSERT INTO outbox_event(event_type,aggregate_id,payload) VALUES ('MEMBER_SESSION_INVALIDATE',?,jsonb_build_object('memberId',?::text))",memberId,memberId);
        jdbc.update("INSERT INTO audit_event(actor_id,action,target_type,target_id,after_summary) VALUES (?,?, 'member',?,jsonb_build_object('active',?,'version',?))",actor,body.active()?"ACTIVATE_MEMBER":"DEACTIVATE_MEMBER",memberId.toString(),body.active(),body.version()+1);
        return new MemberStatus(memberId,body.active(),body.version()+1);
    }
    private void queueOjRoleSync(UUID memberId,boolean desired){
        jdbc.update("INSERT INTO external_role_sync(member_id,desired,version,confirmed_version,status) VALUES (?,?,1,0,'PENDING') ON CONFLICT(member_id) DO UPDATE SET desired=excluded.desired,version=external_role_sync.version+1,status='PENDING',updated_at=now()",memberId,desired);
        Long syncVersion=jdbc.queryForObject("SELECT version FROM external_role_sync WHERE member_id=?",Long.class,memberId);
        jdbc.update("INSERT INTO outbox_event(event_type,aggregate_id,payload) VALUES ('OJ_ADMIN_ROLE_SYNC',?,jsonb_build_object('memberId',?::text,'desired',?,'version',?))",memberId,memberId,desired,syncVersion);
    }
    private boolean hasRole(UUID memberId,String role){return !jdbc.query("SELECT 1 FROM role_assignment WHERE member_id=? AND role=? AND revoked_at IS NULL",(rs,row)->rs.getInt(1),memberId,role).isEmpty();}
    public record RoleChangeRequest(@NotNull Boolean granted,@NotNull Long version){}
    public record RoleChange(UUID memberId,String role,boolean granted,long version){}
    public record MemberStatusRequest(@NotNull Boolean active,@NotNull Long version){}
    public record MemberStatus(UUID memberId,boolean active,long version){}
}
