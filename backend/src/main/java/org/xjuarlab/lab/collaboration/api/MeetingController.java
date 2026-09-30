package org.xjuarlab.lab.collaboration.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.server.ResponseStatusException;
import org.xjuarlab.lab.security.CurrentMember;
import org.xjuarlab.lab.api.PageEnvelope;
import static org.springframework.http.HttpStatus.CONFLICT;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@RestController
@RequestMapping("/api/v1/meetings")
public class MeetingController {
    private final JdbcTemplate jdbc;private final CurrentMember current;
    public MeetingController(JdbcTemplate jdbc,CurrentMember current){this.jdbc=jdbc;this.current=current;}
    @GetMapping public PageEnvelope<MeetingView> list(Authentication auth,@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int pageSize){
        UUID actor=current.id(auth);
        long offset=PageEnvelope.offset(page,pageSize);
        List<MeetingView> items=jdbc.query("SELECT DISTINCT m.id,m.project_id,m.title,m.starts_at,m.created_by,m.version FROM meeting m LEFT JOIN meeting_participant mp ON mp.meeting_id=m.id LEFT JOIN project_member pm ON pm.project_id=m.project_id AND pm.member_id=? WHERE m.created_by=? OR mp.member_id=? OR pm.member_id IS NOT NULL ORDER BY m.starts_at DESC,m.id LIMIT ? OFFSET ?",(rs,row)->new MeetingView((UUID)rs.getObject("id"),(UUID)rs.getObject("project_id"),rs.getString("title"),rs.getObject("starts_at",OffsetDateTime.class),(UUID)rs.getObject("created_by"),rs.getLong("version")),actor,actor,actor,pageSize,offset);
        Long total=jdbc.queryForObject("SELECT count(DISTINCT m.id) FROM meeting m LEFT JOIN meeting_participant mp ON mp.meeting_id=m.id LEFT JOIN project_member pm ON pm.project_id=m.project_id AND pm.member_id=? WHERE m.created_by=? OR mp.member_id=? OR pm.member_id IS NOT NULL",Long.class,actor,actor,actor);
        return new PageEnvelope<>(items,total==null?0:total,page,pageSize);
    }
    @PostMapping @ResponseStatus(org.springframework.http.HttpStatus.CREATED) @Transactional public MeetingView create(Authentication auth,@Valid @RequestBody CreateMeeting input){
        UUID actor=current.id(auth);if(input.projectId()!=null)requireAccess(input.projectId(),null,actor);
        UUID id=jdbc.queryForObject("INSERT INTO meeting(project_id,title,starts_at,created_by) VALUES (?,?,?,?) RETURNING id",UUID.class,input.projectId(),input.title().trim(),input.startsAt(),actor);
        jdbc.update("INSERT INTO meeting_participant(meeting_id,member_id) VALUES (?,?)",id,actor);
        for(UUID participant:input.participants()){requireActiveMember(participant);if(input.projectId()!=null)requireProjectParticipant(input.projectId(),participant);jdbc.update("INSERT INTO meeting_participant(meeting_id,member_id) VALUES (?,?) ON CONFLICT DO NOTHING",id,participant);}
        jdbc.update("INSERT INTO audit_event(actor_id,action,target_type,target_id) VALUES (?,'CREATE_MEETING','meeting',?)",actor,id.toString());
        return jdbc.queryForObject("SELECT id,project_id,title,starts_at,created_by,version FROM meeting WHERE id=?",MeetingController::meetingRow,id);
    }
    @GetMapping("/{meetingId}/minutes") public MinutesView minutes(Authentication auth,@PathVariable UUID meetingId){
        UUID actor=current.id(auth);MeetingView meeting=loadMeeting(meetingId);requireAccess(meeting.projectId(),meetingId,actor);
        return jdbc.query("SELECT version,body FROM minutes_revision WHERE meeting_id=? ORDER BY version DESC LIMIT 1",(rs,row)->new MinutesView(meetingId,rs.getLong(1),rs.getString(2)),meetingId).stream().findFirst().orElse(new MinutesView(meetingId,meeting.version(),""));
    }
    @PutMapping("/{meetingId}/minutes") @Transactional public MinutesView saveMinutes(Authentication auth,@PathVariable UUID meetingId,@RequestHeader("If-Match-Version") long expected,@Valid @RequestBody SaveMinutes body){
        UUID actor=current.id(auth);MeetingView meeting=loadMeetingForUpdate(meetingId);requireAccess(meeting.projectId(),meetingId,actor);
        if(meeting.version()!=expected)throw new ResponseStatusException(CONFLICT,"会议纪要已被修改，请刷新后重试");
        long next=expected+1;jdbc.update("INSERT INTO minutes_revision(meeting_id,version,body,actor_id) VALUES (?,?,?,?)",meetingId,next,body.body().trim(),actor);
        jdbc.update("UPDATE meeting SET version=version+1 WHERE id=? AND version=?",meetingId,expected);
        jdbc.update("INSERT INTO audit_event(actor_id,action,target_type,target_id,after_summary) VALUES (?,'SAVE_MEETING_MINUTES','meeting',?,jsonb_build_object('version',?))",actor,meetingId.toString(),next);
        return new MinutesView(meetingId,next,body.body().trim());
    }
    @GetMapping("/{meetingId}/actions") public List<ProjectController.TaskView> actions(Authentication auth,@PathVariable UUID meetingId){
        UUID actor=current.id(auth);MeetingView meeting=loadMeeting(meetingId);requireAccess(meeting.projectId(),meetingId,actor);
        return jdbc.query("SELECT t.id,t.project_id,t.title,t.description,t.assignee_id,t.created_by,t.due_date,t.status,t.version FROM meeting_action_item a JOIN task t ON t.id=a.task_id WHERE a.meeting_id=? AND t.status<>'CANCELED' ORDER BY t.due_date NULLS LAST,t.created_at,t.id",(rs,row)->new ProjectController.TaskView((UUID)rs.getObject(1),(UUID)rs.getObject(2),rs.getString(3),rs.getString(4),(UUID)rs.getObject(5),(UUID)rs.getObject(6),rs.getObject(7,java.time.LocalDate.class),rs.getString(8),rs.getLong(9)),meetingId);
    }
    @PostMapping("/{meetingId}/actions") @ResponseStatus(org.springframework.http.HttpStatus.CREATED) @Transactional public ProjectController.TaskView addAction(Authentication auth,@PathVariable UUID meetingId,@Valid @RequestBody ActionInput input){
        UUID actor=current.id(auth);MeetingView meeting=loadMeetingForUpdate(meetingId);requireAccess(meeting.projectId(),meetingId,actor);
        if(input.assigneeId()!=null){requireActiveMember(input.assigneeId());if(meeting.projectId()!=null)requireProjectParticipant(meeting.projectId(),input.assigneeId());}
        UUID task=jdbc.queryForObject("INSERT INTO task(project_id,title,description,assignee_id,created_by,due_date) VALUES (?,?,?,?,?,?) RETURNING id",UUID.class,meeting.projectId(),input.title().trim(),input.description()==null?"":input.description().trim(),input.assigneeId(),actor,input.dueDate());
        jdbc.update("INSERT INTO meeting_action_item(meeting_id,task_id) VALUES (?,?)",meetingId,task);
        jdbc.update("INSERT INTO audit_event(actor_id,action,target_type,target_id) VALUES (?,'CREATE_MEETING_ACTION','task',?)",actor,task.toString());
        return jdbc.queryForObject("SELECT id,project_id,title,description,assignee_id,created_by,due_date,status,version FROM task WHERE id=?",(rs,row)->new ProjectController.TaskView((UUID)rs.getObject(1),(UUID)rs.getObject(2),rs.getString(3),rs.getString(4),(UUID)rs.getObject(5),(UUID)rs.getObject(6),rs.getObject(7,java.time.LocalDate.class),rs.getString(8),rs.getLong(9)),task);
    }
    private MeetingView loadMeeting(UUID id){return jdbc.query("SELECT id,project_id,title,starts_at,created_by,version FROM meeting WHERE id=?",MeetingController::meetingRow,id).stream().findFirst().orElseThrow(()->new ResponseStatusException(NOT_FOUND,"会议不存在或无权访问"));}
    private MeetingView loadMeetingForUpdate(UUID id){return jdbc.query("SELECT id,project_id,title,starts_at,created_by,version FROM meeting WHERE id=? FOR UPDATE",MeetingController::meetingRow,id).stream().findFirst().orElseThrow(()->new ResponseStatusException(NOT_FOUND,"会议不存在或无权访问"));}
    private void requireAccess(UUID projectId,UUID meetingId,UUID actor){
        if(projectId!=null){if(jdbc.query("SELECT 1 FROM project_member WHERE project_id=? AND member_id=?",(rs,row)->rs.getInt(1),projectId,actor).isEmpty())throw new ResponseStatusException(NOT_FOUND,"会议不存在或无权访问");return;}
        if(meetingId!=null&&jdbc.query("SELECT 1 FROM meeting m LEFT JOIN meeting_participant p ON p.meeting_id=m.id WHERE m.id=? AND (m.created_by=? OR p.member_id=?)",(rs,row)->rs.getInt(1),meetingId,actor,actor).isEmpty())throw new ResponseStatusException(NOT_FOUND,"会议不存在或无权访问");
    }
    private void requireProjectParticipant(UUID projectId,UUID memberId){if(jdbc.query("SELECT 1 FROM project_member pm JOIN member m ON m.id=pm.member_id WHERE pm.project_id=? AND pm.member_id=? AND m.active=true",(rs,row)->rs.getInt(1),projectId,memberId).isEmpty())throw new ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST,"参与者必须是有效项目成员");}
    private void requireActiveMember(UUID memberId){if(jdbc.query("SELECT 1 FROM member WHERE id=? AND active=true",(rs,row)->rs.getInt(1),memberId).isEmpty())throw new ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST,"参与者不存在或已停用");}
    private static MeetingView meetingRow(java.sql.ResultSet rs,int row)throws java.sql.SQLException{return new MeetingView((UUID)rs.getObject("id"),(UUID)rs.getObject("project_id"),rs.getString("title"),rs.getObject("starts_at",OffsetDateTime.class),(UUID)rs.getObject("created_by"),rs.getLong("version"));}
    public record MeetingView(UUID id,UUID projectId,String title,OffsetDateTime startsAt,UUID createdBy,long version){}
    public record MinutesView(UUID meetingId,long version,String body){}
    public record CreateMeeting(@NotBlank @Size(max=160) String title,UUID projectId,@NotNull OffsetDateTime startsAt,List<UUID> participants){public CreateMeeting{participants=participants==null?List.of():java.util.Collections.unmodifiableList(new java.util.ArrayList<>(participants));}}
    public record SaveMinutes(@NotBlank @Size(max=20000) String body){}
    public record ActionInput(@NotBlank @Size(max=200) String title,@Size(max=5000) String description,UUID assigneeId,java.time.LocalDate dueDate){}
}
