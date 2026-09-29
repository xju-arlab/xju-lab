package org.xjuarlab.lab.collaboration.api;

import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.xjuarlab.lab.security.CurrentMember;

@RestController
@RequestMapping("/api/v1/overview")
public class OverviewController {
    private final JdbcTemplate jdbc;private final CurrentMember current;
    public OverviewController(JdbcTemplate jdbc,CurrentMember current){this.jdbc=jdbc;this.current=current;}
    @GetMapping public Overview overview(Authentication auth){
        UUID actor=current.id(auth);
        long projects=count("SELECT count(*) FROM project_member pm JOIN project p ON p.id=pm.project_id WHERE pm.member_id=? AND p.status='ACTIVE'",actor);
        long openTasks=count("SELECT count(DISTINCT t.id) FROM task t LEFT JOIN project_member pm ON pm.project_id=t.project_id WHERE (t.assignee_id=? OR t.created_by=?) AND (t.project_id IS NULL OR pm.member_id=?) AND t.status IN ('OPEN','IN_PROGRESS')",actor,actor,actor);
        long upcomingMeetings=count("SELECT count(DISTINCT m.id) FROM meeting m LEFT JOIN meeting_participant mp ON mp.meeting_id=m.id LEFT JOIN project_member pm ON pm.project_id=m.project_id WHERE m.starts_at>=now() AND (m.created_by=? OR mp.member_id=? OR pm.member_id=?)",actor,actor,actor);
        long pendingLeaves=count("SELECT count(*) FROM leave_application WHERE (member_id=? OR approver_id=?) AND status='PENDING'",actor,actor);
        String seat=jdbc.query("SELECT s.id FROM seat_assignment a JOIN seat s ON s.id=a.seat_id WHERE a.member_id=? AND a.released_at IS NULL",(rs,row)->rs.getString(1),actor).stream().findFirst().orElse(null);
        return new Overview(projects,openTasks,upcomingMeetings,pendingLeaves,seat);
    }
    private long count(String sql,Object...args){Long value=jdbc.queryForObject(sql,Long.class,args);return value==null?0:value;}
    public record Overview(long activeProjects,long openTasks,long upcomingMeetings,long pendingLeaves,String assignedSeat){}
}
