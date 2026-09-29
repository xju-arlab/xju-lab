package org.xjuarlab.lab.collaboration.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
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
import static org.springframework.http.HttpStatus.FORBIDDEN;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@RestController
@RequestMapping("/api/v1")
public class ProjectController {
    private final JdbcTemplate jdbc;private final CurrentMember current;
    public ProjectController(JdbcTemplate jdbc,CurrentMember current){this.jdbc=jdbc;this.current=current;}

    @GetMapping("/projects") public PageEnvelope<ProjectView> projects(Authentication auth,@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int pageSize){
        UUID actor=current.id(auth);
        long offset=PageEnvelope.offset(page,pageSize);
        List<ProjectView> items=jdbc.query("SELECT p.id,p.title,p.description,p.status,p.lead_id,p.version,p.updated_at FROM project p JOIN project_member pm ON pm.project_id=p.id WHERE pm.member_id=? AND p.status='ACTIVE' ORDER BY p.updated_at DESC,p.id LIMIT ? OFFSET ?",(rs,row)->new ProjectView((UUID)rs.getObject("id"),rs.getString("title"),rs.getString("description"),rs.getString("status"),(UUID)rs.getObject("lead_id"),rs.getLong("version"),rs.getObject("updated_at",java.time.OffsetDateTime.class)),actor,pageSize,offset);
        Long total=jdbc.queryForObject("SELECT count(*) FROM project p JOIN project_member pm ON pm.project_id=p.id WHERE pm.member_id=? AND p.status='ACTIVE'",Long.class,actor);
        return new PageEnvelope<>(items,total==null?0:total,page,pageSize);
    }
    @PostMapping("/projects") @ResponseStatus(org.springframework.http.HttpStatus.CREATED) @Transactional public ProjectView createProject(Authentication auth,@Valid @RequestBody CreateProject input){
        UUID actor=current.id(auth);UUID id=jdbc.queryForObject("INSERT INTO project(title,description,lead_id) VALUES (?,?,?) RETURNING id",UUID.class,input.title().trim(),safe(input.description()),actor);
        jdbc.update("INSERT INTO project_member(project_id,member_id,role) VALUES (?,?,'LEAD')",id,actor);
        jdbc.update("INSERT INTO audit_event(actor_id,action,target_type,target_id) VALUES (?,'CREATE_PROJECT','project',?)",actor,id.toString());
        return jdbc.queryForObject("SELECT id,title,description,status,lead_id,version,updated_at FROM project WHERE id=?",ProjectController::projectRow,id);
    }
    @GetMapping("/projects/{projectId}/tasks") public PageEnvelope<TaskView> tasks(Authentication auth,@PathVariable UUID projectId,@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int pageSize){
        UUID actor=current.id(auth);requireProjectMember(projectId,actor);
        long offset=PageEnvelope.offset(page,pageSize);
        List<TaskView> items=jdbc.query("SELECT id,project_id,title,description,assignee_id,created_by,due_date,status,version FROM task WHERE project_id=? AND status<>'CANCELED' ORDER BY due_date NULLS LAST,created_at,id LIMIT ? OFFSET ?",(rs,row)->taskRow(rs),projectId,pageSize,offset);
        Long total=jdbc.queryForObject("SELECT count(*) FROM task WHERE project_id=? AND status<>'CANCELED'",Long.class,projectId);
        return new PageEnvelope<>(items,total==null?0:total,page,pageSize);
    }
    @PostMapping("/projects/{projectId}/tasks") @ResponseStatus(org.springframework.http.HttpStatus.CREATED) @Transactional public TaskView createTask(Authentication auth,@PathVariable UUID projectId,@Valid @RequestBody CreateTask input){
        UUID actor=current.id(auth);requireProjectMember(projectId,actor);validateAssignee(projectId,input.assigneeId());
        UUID id=jdbc.queryForObject("INSERT INTO task(project_id,title,description,assignee_id,created_by,due_date) VALUES (?,?,?,?,?,?) RETURNING id",UUID.class,projectId,input.title().trim(),safe(input.description()),input.assigneeId(),actor,input.dueDate());
        jdbc.update("INSERT INTO audit_event(actor_id,action,target_type,target_id) VALUES (?,'CREATE_TASK','task',?)",actor,id.toString());
        return jdbc.queryForObject("SELECT id,project_id,title,description,assignee_id,created_by,due_date,status,version FROM task WHERE id=?",(rs,row)->taskRow(rs),id);
    }
    @GetMapping("/tasks/mine") public PageEnvelope<TaskView> myTasks(Authentication auth,@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int pageSize){
        UUID actor=current.id(auth);
        long offset=PageEnvelope.offset(page,pageSize);
        List<TaskView> items=jdbc.query("SELECT t.id,t.project_id,t.title,t.description,t.assignee_id,t.created_by,t.due_date,t.status,t.version FROM task t LEFT JOIN project_member pm ON pm.project_id=t.project_id AND pm.member_id=? WHERE (t.assignee_id=? OR t.created_by=?) AND (t.project_id IS NULL OR pm.member_id IS NOT NULL) ORDER BY t.due_date NULLS LAST,t.created_at,t.id LIMIT ? OFFSET ?",(rs,row)->taskRow(rs),actor,actor,actor,pageSize,offset);
        Long total=jdbc.queryForObject("SELECT count(*) FROM task t LEFT JOIN project_member pm ON pm.project_id=t.project_id AND pm.member_id=? WHERE (t.assignee_id=? OR t.created_by=?) AND (t.project_id IS NULL OR pm.member_id IS NOT NULL)",Long.class,actor,actor,actor);
        return new PageEnvelope<>(items,total==null?0:total,page,pageSize);
    }
    @PatchMapping("/tasks/{taskId}") @Transactional public TaskView updateTask(Authentication auth,@PathVariable UUID taskId,@RequestHeader("If-Match-Version") long version,@Valid @RequestBody TaskUpdate input){
        UUID actor=current.id(auth);TaskView task=jdbc.query("SELECT id,project_id,title,description,assignee_id,created_by,due_date,status,version FROM task WHERE id=?",(rs,row)->taskRow(rs),taskId).stream().findFirst().orElseThrow(()->new ResponseStatusException(NOT_FOUND,"任务不存在"));
        if(task.projectId()!=null)requireProjectMember(task.projectId(),actor);else if(!actor.equals(task.assigneeId())&&!actor.equals(task.createdBy()))throw new ResponseStatusException(FORBIDDEN,"不能访问此任务");
        if(task.version()!=version)throw new ResponseStatusException(CONFLICT,"任务已被修改，请刷新后重试");
        String status=input.status()==null?task.status():input.status();
        if(!List.of("OPEN","IN_PROGRESS","DONE","CANCELED").contains(status))throw new ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST,"任务状态无效");
        String title=input.title()==null?task.title():input.title().trim();if(title.isBlank())throw new ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST,"任务标题不能为空");
        int changed=jdbc.update("UPDATE task SET title=?,status=?,version=version+1,updated_at=now() WHERE id=? AND version=?",title,status,taskId,version);
        if(changed==0)throw new ResponseStatusException(CONFLICT,"任务已被修改，请刷新后重试");
        jdbc.update("INSERT INTO audit_event(actor_id,action,target_type,target_id,after_summary) VALUES (?,'UPDATE_TASK','task',?,jsonb_build_object('status',?,'version',?))",actor,taskId.toString(),status,version+1);
        return jdbc.queryForObject("SELECT id,project_id,title,description,assignee_id,created_by,due_date,status,version FROM task WHERE id=?",(rs,row)->taskRow(rs),taskId);
    }
    private void requireProjectMember(UUID projectId,UUID actor){if(jdbc.query("SELECT 1 FROM project_member pm JOIN project p ON p.id=pm.project_id WHERE pm.project_id=? AND pm.member_id=? AND p.status='ACTIVE'",(rs,row)->rs.getInt(1),projectId,actor).isEmpty())throw new ResponseStatusException(NOT_FOUND,"项目不存在或无权访问");}
    private void validateAssignee(UUID projectId,UUID assignee){if(assignee!=null&&jdbc.query("SELECT 1 FROM project_member pm JOIN member m ON m.id=pm.member_id WHERE pm.project_id=? AND pm.member_id=? AND m.active=true",(rs,row)->rs.getInt(1),projectId,assignee).isEmpty())throw new ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST,"负责人必须是有效项目成员");}
    private static String safe(String value){return value==null?"":value.trim();}
    private static ProjectView projectRow(java.sql.ResultSet rs,int row)throws java.sql.SQLException{return new ProjectView((UUID)rs.getObject("id"),rs.getString("title"),rs.getString("description"),rs.getString("status"),(UUID)rs.getObject("lead_id"),rs.getLong("version"),rs.getObject("updated_at",java.time.OffsetDateTime.class));}
    private static TaskView taskRow(java.sql.ResultSet rs)throws java.sql.SQLException{return new TaskView((UUID)rs.getObject("id"),(UUID)rs.getObject("project_id"),rs.getString("title"),rs.getString("description"),(UUID)rs.getObject("assignee_id"),(UUID)rs.getObject("created_by"),rs.getObject("due_date",LocalDate.class),rs.getString("status"),rs.getLong("version"));}
    public record ProjectView(UUID id,String title,String description,String status,UUID leadId,long version,java.time.OffsetDateTime updatedAt){}
    public record TaskView(UUID id,UUID projectId,String title,String description,UUID assigneeId,UUID createdBy,LocalDate dueDate,String status,long version){}
    public record CreateProject(@NotBlank @Size(max=160) String title,@Size(max=5000) String description){}
    public record CreateTask(@NotBlank @Size(max=200) String title,@Size(max=5000) String description,UUID assigneeId,LocalDate dueDate){}
    public record TaskUpdate(@Size(max=200) String title,String status){}
}
