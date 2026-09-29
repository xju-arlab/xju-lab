package org.xjuarlab.lab.assessment;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.xjuarlab.lab.api.PageEnvelope;
import org.xjuarlab.lab.security.CurrentMember;
import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.CONFLICT;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@RestController
@RequestMapping("/api/v1/assessment")
public class AssessmentController {
    private final JdbcTemplate jdbc; private final CurrentMember current; private final AssessmentScoringService scoring; private final ObjectMapper mapper;
    public AssessmentController(JdbcTemplate jdbc,CurrentMember current,AssessmentScoringService scoring,ObjectMapper mapper){this.jdbc=jdbc;this.current=current;this.scoring=scoring;this.mapper=mapper;}

    @GetMapping("/terms") public List<TermView> terms(Authentication auth){current.id(auth);return jdbc.query("SELECT id,name,starts_on,ends_on,active,version FROM training_term ORDER BY starts_on DESC,id",(rs,row)->new TermView((UUID)rs.getObject(1),rs.getString(2),rs.getObject(3,LocalDate.class),rs.getObject(4,LocalDate.class),rs.getBoolean(5),rs.getLong(6)));}

    @PostMapping("/terms") @Transactional public TermView createTerm(Authentication auth,@Valid @RequestBody CreateTerm input){
        UUID actor=current.id(auth);requireAdmin(actor);if(input.startsOn().isAfter(input.endsOn()))throw new ResponseStatusException(BAD_REQUEST,"培养期结束日期不能早于开始日期");
        UUID id=jdbc.queryForObject("INSERT INTO training_term(name,starts_on,ends_on,active) VALUES (?,?,?,?) RETURNING id",UUID.class,input.name().trim(),input.startsOn(),input.endsOn(),input.active());
        audit(actor,"CREATE_TRAINING_TERM",id,"active",input.active());return term(id);
    }

    @GetMapping("/terms/{termId}/members") public PageEnvelope<TermMemberView> members(Authentication auth,@PathVariable UUID termId,@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="50") int pageSize){
        UUID actor=current.id(auth);requireAssessmentAccess(actor,termId);long offset=PageEnvelope.offset(page,pageSize);
        List<TermMemberView> rows=jdbc.query("SELECT tm.member_id,m.display_name,COALESCE(NULLIF(m.student_number,''),m.account_id,m.id::text) AS number,tm.veteran,tm.version FROM term_member tm JOIN member m ON m.id=tm.member_id WHERE tm.term_id=? AND m.active=true ORDER BY number LIMIT ? OFFSET ?",(rs,row)->new TermMemberView((UUID)rs.getObject(1),rs.getString(2),rs.getString(3),rs.getBoolean(4),rs.getLong(5)),termId,pageSize,offset);
        Long total=jdbc.queryForObject("SELECT count(*) FROM term_member tm JOIN member m ON m.id=tm.member_id WHERE tm.term_id=? AND m.active=true",Long.class,termId);return new PageEnvelope<>(rows,total==null?0:total,page,pageSize);
    }

    @PostMapping("/terms/{termId}/members") @Transactional public TermMemberView addTermMember(Authentication auth,@PathVariable UUID termId,@Valid @RequestBody AddTermMember input){
        UUID actor=current.id(auth);requireAdmin(actor);requireTerm(termId);requireActiveMember(input.memberId());
        lockTerm(termId);
        jdbc.update("INSERT INTO term_member(term_id,member_id,veteran) VALUES (?,?,?) ON CONFLICT (term_id,member_id) DO UPDATE SET veteran=EXCLUDED.veteran,version=term_member.version+1",termId,input.memberId(),input.veteran());bumpTermVersion(termId);
        audit(actor,"ADD_TERM_MEMBER",input.memberId(),null,input.veteran());return termMember(termId,input.memberId());
    }

    @PatchMapping("/terms/{termId}/members/{memberId}") @Transactional public TermMemberView setVeteran(Authentication auth,@PathVariable UUID termId,@PathVariable UUID memberId,@RequestBody VeteranInput input){
        UUID actor=current.id(auth);requireAdmin(actor);lockTerm(termId);int changed=jdbc.update("UPDATE term_member SET veteran=?,version=version+1 WHERE term_id=? AND member_id=? AND version=?",input.veteran(),termId,memberId,input.version());
        if(changed==0)throw new ResponseStatusException(CONFLICT,"成员培养期记录已变化，请刷新后重试");bumpTermVersion(termId);audit(actor,"SET_TERM_VETERAN",memberId,null,input.veteran());return termMember(termId,memberId);
    }

    @GetMapping("/terms/{termId}/exams") public List<ExamView> exams(Authentication auth,@PathVariable UUID termId){UUID actor=current.id(auth);requireAssessmentAccess(actor,termId);return jdbc.query("SELECT id,term_id,title,kind,starts_at,event_order,rubric_snapshot::text,published_at,version FROM exam WHERE term_id=? ORDER BY starts_at,event_order,id",this::examRow,termId);}

    @PostMapping("/terms/{termId}/exams") @Transactional public ExamView createExam(Authentication auth,@PathVariable UUID termId,@Valid @RequestBody CreateExam input){
        UUID actor=current.id(auth);requireAdmin(actor);lockTerm(termId);validateKind(input.kind());validateRubric(input.rubric());
        int eventOrder=input.eventOrder()==null?nextEventOrder(termId,input.startsAt()):input.eventOrder();if(eventOrder<1)throw new ResponseStatusException(BAD_REQUEST,"场次序号必须大于零");
        String json=write(validateRubric(input.rubric()));UUID id=jdbc.queryForObject("INSERT INTO exam(term_id,title,kind,starts_at,event_order,rubric_snapshot,created_by) VALUES (?,?,?,?,?,?::jsonb,?) RETURNING id",UUID.class,termId,input.title().trim(),input.kind(),input.startsAt(),eventOrder,json,actor);bumpTermVersion(termId);
        audit(actor,"CREATE_ASSESSMENT_EXAM",id,"kind",input.kind());return exam(id);
    }

    @GetMapping("/exams/{examId}/ranking") public RankingPage<TheoryRankingView> theoryRanking(Authentication auth,@PathVariable UUID examId,@RequestParam(defaultValue="false") boolean excludeVeterans,@RequestParam(defaultValue="") String q,@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="50") int pageSize){
        UUID actor=current.id(auth);ExamView selected=exam(examId);requireAssessmentAccess(actor,selected.termId());boolean staff=isStaff(actor);
        var students=students(selected.termId()).stream().filter(s->!excludeVeterans||!s.veteran()).toList();var examData=theoryExams(selected.termId());var rows=scoring.theory(students,examData,examId.toString());
        List<TheoryRankingView> all=rows.stream().filter(r->staff||r.student().id().equals(actor.toString())).filter(r->matches(r.student(),q)).map(AssessmentController::theoryView).toList();
        String source=sourceVersion(selected.termId());return rankingPage(pageTheory(all,page,pageSize),rows.size(),source);
    }

    @PutMapping("/exams/{examId}/grades/{memberId}") @Transactional public GradeRevisionView saveGrade(Authentication auth,@PathVariable UUID examId,@PathVariable UUID memberId,@RequestHeader("If-Match-Version") long expectedVersion,@Valid @RequestBody SaveGrade input){
        UUID actor=current.id(auth);requireTeacher(actor);ExamView exam=exam(examId);lockTerm(exam.termId());exam=examForUpdate(examId);if(exam.version()!=expectedVersion)throw new ResponseStatusException(CONFLICT,"考试版本已变化，请刷新后重试");
        if(jdbc.query("SELECT 1 FROM term_member WHERE term_id=? AND member_id=?",(rs,row)->rs.getInt(1),exam.termId(),memberId).isEmpty())throw new ResponseStatusException(NOT_FOUND,"成员不属于当前培养期");
        if(!List.of("GRADED","PENDING","ABSENT","EXEMPT").contains(input.status()))throw new ResponseStatusException(BAD_REQUEST,"成绩状态无效");
        List<RubricView> rubric=readRubric(exam.rubricSnapshot());Map<String,Double> parts=input.parts()==null?Map.of():input.parts();Double score=input.score();
        if("GRADED".equals(input.status())){
            if(!parts.isEmpty()){Double computed=AssessmentScoringService.rubricScore(parts,rubric.stream().map(r->new AssessmentScoringService.RubricCriterion(r.id(),r.weight())).toList());if(computed==null)throw new ResponseStatusException(BAD_REQUEST,"分项分数不完整或超出范围");if(score!=null&&Math.abs(score-computed)>0.0005)throw new ResponseStatusException(BAD_REQUEST,"总分与量规计算结果不一致");score=computed;}
            if(!AssessmentScoringService.validScore(score))throw new ResponseStatusException(BAD_REQUEST,"已评分成绩必须在 0–100 之间");
        }else if(score!=null||!parts.isEmpty())throw new ResponseStatusException(BAD_REQUEST,"待评分、缺考或免考记录不能保存成绩分数");
        Integer revision=jdbc.queryForObject("SELECT COALESCE(max(revision),0)+1 FROM grade_revision WHERE exam_id=? AND member_id=?",Integer.class,examId,memberId);
        jdbc.update("INSERT INTO grade_revision(exam_id,member_id,revision,score,status,parts,comment,actor_id,reason) VALUES (?,?,?,?,?,?::jsonb,?,?,?)",examId,memberId,revision,score==null?null:BigDecimal.valueOf(score),input.status(),write(parts),input.comment(),actor,input.reason().trim());
        int changed=jdbc.update("UPDATE exam SET version=version+1 WHERE id=? AND version=?",examId,expectedVersion);if(changed==0)throw new ResponseStatusException(CONFLICT,"考试版本已变化，请刷新后重试");bumpTermVersion(exam.termId());
        audit(actor,"REVISE_ASSESSMENT_GRADE",memberId,null,Map.of("examId",examId,"revision",revision,"status",input.status()));
        return new GradeRevisionView(examId,memberId,revision,score,input.status(),parts,input.comment(),actor,OffsetDateTime.now(),expectedVersion+1);
    }

    @PostMapping("/exams/{examId}/publish") @Transactional public PublishedView publishTheory(Authentication auth,@PathVariable UUID examId,@RequestHeader("If-Match-Version") long expectedVersion){
        UUID actor=current.id(auth);requireAdmin(actor);ExamView exam=exam(examId);long currentTermVersion=lockTerm(exam.termId());if(currentTermVersion!=expectedVersion)throw new ResponseStatusException(CONFLICT,"培养期成绩已变化，请刷新后重试");
        List<TheoryRankingView> rows=scoring.theory(students(exam.termId()),theoryExams(exam.termId()),examId.toString()).stream().map(AssessmentController::theoryView).toList();
        String source=sourceVersion(exam.termId());String payload=write(new RankingPublication<>(source,AssessmentScoringService.ALGORITHM_VERSION,OffsetDateTime.now(),rows.size(),rows));
        UUID snapshot=jdbc.queryForObject("INSERT INTO ranking_snapshot(term_id,kind,source_version,algorithm_version,payload,published_at,created_by) VALUES (?,'THEORY',?,?,?::jsonb,now(),?) RETURNING id",UUID.class,exam.termId(),source,AssessmentScoringService.ALGORITHM_VERSION,payload,actor);
        jdbc.update("UPDATE exam SET published_at=now() WHERE id=?",examId);audit(actor,"PUBLISH_THEORY_RANKING",snapshot,"examId",examId);return published(snapshot,exam.termId(),"THEORY",source);
    }

    @GetMapping("/exams/{examId}/published") public List<PublishedView> publishedTheory(Authentication auth,@PathVariable UUID examId){UUID actor=current.id(auth);ExamView exam=exam(examId);requireAssessmentAccess(actor,exam.termId());boolean staff=isStaff(actor);
        List<PublishedSnapshot> values=jdbc.query("SELECT id,source_version,payload::text,published_at FROM ranking_snapshot WHERE term_id=? AND kind='THEORY' ORDER BY published_at DESC,id",(rs,row)->new PublishedSnapshot((UUID)rs.getObject(1),rs.getString(2),rs.getString(3),rs.getObject(4,OffsetDateTime.class)),exam.termId());
        return values.stream().map(s->{JsonNode payload=parse(s.payload());if(!staff)payload=onlyMember(payload,actor.toString());return new PublishedView(s.id(),exam.termId(),"THEORY",s.sourceVersion(),AssessmentScoringService.ALGORITHM_VERSION,s.publishedAt(),payload);}).toList();
    }

    @GetMapping("/exams/{examId}/ranking.csv") public ResponseEntity<byte[]> exportTheoryCsv(Authentication auth,@PathVariable UUID examId,@RequestParam(defaultValue="false") boolean excludeVeterans){
        UUID actor=current.id(auth);ExamView exam=exam(examId);requireAssessmentAccess(actor,exam.termId());boolean staff=isStaff(actor);
        var eligible=students(exam.termId()).stream().filter(s->!excludeVeterans||!s.veteran()).toList();List<TheoryRankingView> rows=scoring.theory(eligible,theoryExams(exam.termId()),examId.toString()).stream().filter(r->staff||r.student().id().equals(actor.toString())).map(AssessmentController::theoryView).toList();
        byte[] csv=("\uFEFF"+csv(rows)).getBytes(StandardCharsets.UTF_8);return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename=assessment-"+examId+".csv").contentType(new MediaType("text","csv",StandardCharsets.UTF_8)).body(csv);
    }

    @GetMapping("/terms/{termId}/contests") public List<ContestView> contests(Authentication auth,@PathVariable UUID termId){UUID actor=current.id(auth);requireAssessmentAccess(actor,termId);return jdbc.query("SELECT DISTINCT ON (contest_id) id,contest_id,title,source_version,ended_at,event_order,complete FROM contest_snapshot WHERE term_id=? ORDER BY contest_id,imported_at DESC,id",(rs,row)->new ContestView((UUID)rs.getObject(1),rs.getString(2),rs.getString(3),rs.getString(4),rs.getObject(5,OffsetDateTime.class),rs.getInt(6),rs.getBoolean(7)),termId);}

    @GetMapping("/terms/{termId}/contests/{snapshotId}/ranking") public RankingPage<AcmRankingView> acmRanking(Authentication auth,@PathVariable UUID termId,@PathVariable UUID snapshotId,@RequestParam(defaultValue="false") boolean excludeVeterans,@RequestParam(defaultValue="") String q,@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="50") int pageSize){
        UUID actor=current.id(auth);requireAssessmentAccess(actor,termId);boolean staff=isStaff(actor);
        List<AssessmentScoringService.AcmContest> contests=acmContests(termId);if(jdbc.query("SELECT 1 FROM contest_snapshot WHERE id=? AND term_id=? AND complete=true",(rs,row)->rs.getInt(1),snapshotId,termId).isEmpty())throw new ResponseStatusException(NOT_FOUND,"完整比赛快照不存在");
        var rows=scoring.acm(students(termId),contests,snapshotId.toString(),excludeVeterans);List<AcmRankingView> visible=rows.stream().filter(r->staff||r.student().id().equals(actor.toString())).filter(r->matches(r.student(),q)).map(AssessmentController::acmView).toList();String source=acmSourceVersion(termId,snapshotId);return rankingPage(pageAcm(visible,page,pageSize),rows.size(),source);
    }

    @GetMapping("/terms/{termId}/contests/{snapshotId}/ranking.csv") public ResponseEntity<byte[]> exportAcmCsv(Authentication auth,@PathVariable UUID termId,@PathVariable UUID snapshotId,@RequestParam(defaultValue="false") boolean excludeVeterans){
        UUID actor=current.id(auth);requireAssessmentAccess(actor,termId);boolean staff=isStaff(actor);
        if(jdbc.query("SELECT 1 FROM contest_snapshot WHERE id=? AND term_id=? AND complete=true AND ended_at IS NOT NULL",(rs,row)->rs.getInt(1),snapshotId,termId).isEmpty())throw new ResponseStatusException(NOT_FOUND,"完整比赛快照不存在");
        var eligible=students(termId).stream().filter(s->!excludeVeterans||!s.veteran()).toList();
        List<AcmRankingView> rows=scoring.acm(eligible,acmContests(termId),snapshotId.toString(),excludeVeterans).stream().filter(r->staff||r.student().id().equals(actor.toString())).map(AssessmentController::acmView).toList();
        byte[] csv=("\uFEFF"+csvAcm(rows)).getBytes(StandardCharsets.UTF_8);
        return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename=acm-"+snapshotId+".csv").contentType(new MediaType("text","csv",StandardCharsets.UTF_8)).body(csv);
    }

    @PostMapping("/terms/{termId}/contests/{snapshotId}/publish") @Transactional public PublishedView publishAcm(Authentication auth,@PathVariable UUID termId,@PathVariable UUID snapshotId,@RequestHeader("If-Match-Version") long expectedVersion){
        UUID actor=current.id(auth);requireAdmin(actor);long version=lockTerm(termId);
        if(version!=expectedVersion)throw new ResponseStatusException(CONFLICT,"培养期版本已变化，请刷新后重试");
        if(jdbc.query("SELECT 1 FROM contest_snapshot WHERE id=? AND term_id=? AND complete=true AND ended_at IS NOT NULL",(rs,row)->rs.getInt(1),snapshotId,termId).isEmpty())throw new ResponseStatusException(NOT_FOUND,"完整比赛快照不存在");
        var rows=scoring.acm(students(termId),acmContests(termId),snapshotId.toString(),false).stream().map(AssessmentController::acmView).toList();String source=acmSourceVersion(termId,snapshotId);
        String payload=write(new RankingPublication<>(source,AssessmentScoringService.ALGORITHM_VERSION,OffsetDateTime.now(),rows.size(),rows));UUID id=jdbc.queryForObject("INSERT INTO ranking_snapshot(term_id,kind,source_version,algorithm_version,payload,published_at,created_by) VALUES (?,'ACM',?,?,?::jsonb,now(),?) RETURNING id",UUID.class,termId,source,AssessmentScoringService.ALGORITHM_VERSION,payload,actor);
        audit(actor,"PUBLISH_ACM_RANKING",id,"snapshotId",snapshotId);return published(id,termId,"ACM",source);
    }

    private List<AssessmentScoringService.AcmContest> acmContests(UUID termId){
        List<SnapshotSource> snapshots=jdbc.query("SELECT id,contest_id,COALESCE(NULLIF(title,''),contest_id),term_id::text,ended_at,event_order,complete FROM contest_snapshot WHERE term_id=? AND complete=true AND ended_at IS NOT NULL ORDER BY ended_at,event_order,id",(rs,row)->new SnapshotSource((UUID)rs.getObject(1),rs.getString(2),rs.getString(3),rs.getString(4),rs.getObject(5,OffsetDateTime.class),rs.getInt(6),rs.getBoolean(7)),termId);
        List<AssessmentScoringService.AcmContest> result=new ArrayList<>();
        for(SnapshotSource snapshot:snapshots){List<AssessmentScoringService.ContestResult> contestResults=jdbc.query("SELECT cr.member_id::text,cr.solved,cr.penalty FROM contest_result cr JOIN term_member tm ON tm.member_id=cr.member_id AND tm.term_id=? JOIN member m ON m.id=tm.member_id AND m.active=true WHERE cr.snapshot_id=?",(rs,row)->new AssessmentScoringService.ContestResult(rs.getString(1),rs.getInt(2),rs.getLong(3)),termId,snapshot.id());result.add(new AssessmentScoringService.AcmContest(snapshot.id().toString(),snapshot.title(),snapshot.termId(),snapshot.endedAt().toInstant(),snapshot.eventOrder(),snapshot.complete(),contestResults));}
        return result;
    }
    private List<AssessmentScoringService.Student> students(UUID termId){return jdbc.query("SELECT m.id::text,COALESCE(NULLIF(m.student_number,''),m.account_id,m.id::text),m.display_name,tm.veteran FROM term_member tm JOIN member m ON m.id=tm.member_id WHERE tm.term_id=? AND m.active=true ORDER BY 2",(rs,row)->new AssessmentScoringService.Student(rs.getString(1),rs.getString(2),rs.getString(3),rs.getBoolean(4)),termId);}
    private List<AssessmentScoringService.TheoryExam> theoryExams(UUID termId){
        List<ExamView> exams=jdbc.query("SELECT id,term_id,title,kind,starts_at,event_order,rubric_snapshot::text,published_at,version FROM exam WHERE term_id=? ORDER BY starts_at,event_order,id",this::examRow,termId);
        List<AssessmentScoringService.TheoryExam> values=new ArrayList<>();
        for(ExamView exam:exams){List<AssessmentScoringService.GradeMark> grades=jdbc.query("SELECT DISTINCT ON (member_id) member_id::text,status,score,parts::text,comment,revision FROM grade_revision WHERE exam_id=? ORDER BY member_id,revision DESC",(rs,row)->new AssessmentScoringService.GradeMark(rs.getString(1),rs.getString(2),rs.getBigDecimal(3)==null?null:rs.getBigDecimal(3).doubleValue(),readNumberMap(rs.getString(4)),rs.getString(5),rs.getInt(6)),exam.id());values.add(new AssessmentScoringService.TheoryExam(exam.id().toString(),exam.title(),exam.termId().toString(),exam.kind(),exam.startsAt().toInstant(),exam.eventOrder(),grades));}
        return values;
    }
    private int nextEventOrder(UUID termId,OffsetDateTime startsAt){Integer max=jdbc.queryForObject("SELECT COALESCE(max(event_order),0) FROM exam WHERE term_id=? AND starts_at=?",Integer.class,termId,startsAt);return max==null?1:max+1;}
    private List<RubricView> validateRubric(List<RubricInput> input){List<RubricInput> values=input==null?List.of():input;if(values.stream().anyMatch(v->v.id().isBlank()||v.label().isBlank()||!Double.isFinite(v.weight())||v.weight()<=0)||values.stream().map(RubricInput::id).distinct().count()!=values.size())throw new ResponseStatusException(BAD_REQUEST,"评分量规项目无效");if(!values.isEmpty()&&Math.abs(values.stream().mapToDouble(RubricInput::weight).sum()-1d)>1e-9)throw new ResponseStatusException(BAD_REQUEST,"量规权重之和必须为 1");return values.stream().map(v->new RubricView(v.id().trim(),v.label().trim(),v.weight())).toList();}
    private List<RubricView> readRubric(JsonNode node){List<RubricView> values=new ArrayList<>();if(node!=null&&node.isArray())for(JsonNode item:node)values.add(new RubricView(item.path("id").asText(),item.path("label").asText(),item.path("weight").asDouble()));return values;}
    private ExamView exam(UUID id){return jdbc.query("SELECT id,term_id,title,kind,starts_at,event_order,rubric_snapshot::text,published_at,version FROM exam WHERE id=?",this::examRow,id).stream().findFirst().orElseThrow(AssessmentController::hidden);}
    private ExamView examForUpdate(UUID id){return jdbc.query("SELECT id,term_id,title,kind,starts_at,event_order,rubric_snapshot::text,published_at,version FROM exam WHERE id=? FOR UPDATE",this::examRow,id).stream().findFirst().orElseThrow(AssessmentController::hidden);}
    private ExamView examRow(java.sql.ResultSet rs,int row)throws java.sql.SQLException{return new ExamView((UUID)rs.getObject("id"),(UUID)rs.getObject("term_id"),rs.getString("title"),rs.getString("kind"),rs.getObject("starts_at",OffsetDateTime.class),rs.getInt("event_order"),parse(rs.getString("rubric_snapshot")),rs.getObject("published_at",OffsetDateTime.class),rs.getLong("version"));}
    private TermView term(UUID id){return jdbc.query("SELECT id,name,starts_on,ends_on,active,version FROM training_term WHERE id=?",(rs,row)->new TermView((UUID)rs.getObject(1),rs.getString(2),rs.getObject(3,LocalDate.class),rs.getObject(4,LocalDate.class),rs.getBoolean(5),rs.getLong(6)),id).stream().findFirst().orElseThrow(AssessmentController::hidden);}
    private TermMemberView termMember(UUID term,UUID member){return jdbc.query("SELECT tm.member_id,m.display_name,COALESCE(NULLIF(m.student_number,''),m.account_id,m.id::text),tm.veteran,tm.version FROM term_member tm JOIN member m ON m.id=tm.member_id WHERE tm.term_id=? AND tm.member_id=?",(rs,row)->new TermMemberView((UUID)rs.getObject(1),rs.getString(2),rs.getString(3),rs.getBoolean(4),rs.getLong(5)),term,member).stream().findFirst().orElseThrow(AssessmentController::hidden);}
    private String sourceVersion(UUID term){String value=jdbc.queryForObject("SELECT COALESCE(string_agg(e.id::text||':'||e.version::text,',' ORDER BY e.starts_at,e.event_order,e.id),'') FROM exam e WHERE e.term_id=?",String.class,term);Long revisions=jdbc.queryForObject("SELECT count(*) FROM grade_revision g JOIN exam e ON e.id=g.exam_id WHERE e.term_id=?",Long.class,term);return "term-assessment-v"+sha256((value==null?"":value)+"|"+(revisions==null?0:revisions));}
    private String acmSourceVersion(UUID term,UUID selected){return jdbc.query("SELECT contest_id,source_version FROM contest_snapshot WHERE term_id=? AND complete=true AND ended_at IS NOT NULL ORDER BY ended_at,event_order,contest_id",(rs,row)->rs.getString(1)+":"+rs.getString(2),term).stream().reduce("selected="+selected,(a,b)->a+"|"+b);}
    private PublishedView published(UUID id,UUID term,String kind,String source){return jdbc.query("SELECT published_at FROM ranking_snapshot WHERE id=?",(rs,row)->new PublishedView(id,term,kind,source,AssessmentScoringService.ALGORITHM_VERSION,rs.getObject(1,OffsetDateTime.class),null),id).getFirst();}
    private JsonNode onlyMember(JsonNode payload,String memberId){JsonNode copy=payload.deepCopy();JsonNode rows=copy.path("rows");if(rows.isArray()){var filtered=mapper.createArrayNode();for(JsonNode row:rows)if(memberId.equals(row.path("student").path("id").asText()))filtered.add(row);((com.fasterxml.jackson.databind.node.ObjectNode)copy).set("rows",filtered);}return copy;}
    private PageEnvelope<TheoryRankingView> pageTheory(List<TheoryRankingView> items,int page,int size){long offset=PageEnvelope.offset(page,size);int from=(int)Math.min(items.size(),offset),to=Math.min(items.size(),from+size);return new PageEnvelope<>(items.subList(from,to),items.size(),page,size);}
    private PageEnvelope<AcmRankingView> pageAcm(List<AcmRankingView> items,int page,int size){long offset=PageEnvelope.offset(page,size);int from=(int)Math.min(items.size(),offset),to=Math.min(items.size(),from+size);return new PageEnvelope<>(items.subList(from,to),items.size(),page,size);}
    private <T> RankingPage<T> rankingPage(PageEnvelope<T> page,long eligible,String source){return new RankingPage<>(page.items(),page.total(),page.page(),page.pageSize(),source,AssessmentScoringService.ALGORITHM_VERSION,OffsetDateTime.now(),(int)eligible);}
    private boolean matches(AssessmentScoringService.Student student,String q){return q==null||q.isBlank()||student.name().toLowerCase().contains(q.toLowerCase())||student.number().toLowerCase().contains(q.toLowerCase());}
    private void requireAssessmentAccess(UUID actor,UUID term){requireTerm(term);if(isStaff(actor))return;if(jdbc.query("SELECT 1 FROM term_member WHERE term_id=? AND member_id=?",(rs,row)->rs.getInt(1),term,actor).isEmpty())throw hidden();}
    private boolean isStaff(UUID actor){return current.roles(actor).stream().anyMatch(r->r.equals("TEACHER")||r.equals("LAB_ADMIN")||r.equals("SUPER_ADMIN"));}
    private void requireTeacher(UUID actor){current.requireRole(actor,"TEACHER","LAB_ADMIN","SUPER_ADMIN");}
    private void requireAdmin(UUID actor){current.requireRole(actor,"LAB_ADMIN","SUPER_ADMIN");}
    private void requireTerm(UUID id){if(jdbc.query("SELECT 1 FROM training_term WHERE id=?",(rs,row)->rs.getInt(1),id).isEmpty())throw hidden();}
    private long lockTerm(UUID id){return jdbc.query("SELECT version FROM training_term WHERE id=? FOR UPDATE",(rs,row)->rs.getLong(1),id).stream().findFirst().orElseThrow(AssessmentController::hidden);}
    private void bumpTermVersion(UUID id){jdbc.update("UPDATE training_term SET version=version+1 WHERE id=?",id);}
    private static String sha256(String value){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));}catch(Exception ex){throw new IllegalStateException(ex);}}
    private void requireActiveMember(UUID id){if(jdbc.query("SELECT 1 FROM member WHERE id=? AND active=true",(rs,row)->rs.getInt(1),id).isEmpty())throw new ResponseStatusException(BAD_REQUEST,"成员不存在或已停用");}
    private void validateKind(String kind){if(!"WRITTEN".equals(kind)&&!"PRACTICAL".equals(kind))throw new ResponseStatusException(BAD_REQUEST,"理论考试类型只能是笔试或机试");}
    private void audit(UUID actor,String action,UUID target,String before,Object after){jdbc.update("INSERT INTO audit_event(actor_id,action,target_type,target_id,before_summary,after_summary) VALUES (?,?,'assessment',?,?::jsonb,?::jsonb)",actor,action,target.toString(),write(before),write(after));}
    private String csv(List<TheoryRankingView> rows){StringBuilder out=new StringBuilder("名次,学号,姓名,本次名次,本次成绩,历史均分,有效历史场数,历史总场数,综合分\r\n");for(TheoryRankingView row:rows){List<String> fields=List.of(value(row.overallRank()),row.student().number(),row.student().name(),value(row.currentRank()),value(row.currentScore()),value(row.historyAverage()),Integer.toString(row.historyCount()),Integer.toString(row.historyTotal()),value(row.composite()));out.append(fields.stream().map(AssessmentController::csvCell).reduce((a,b)->a+","+b).orElse("")).append("\r\n");}return out.toString();}
    private String csvAcm(List<AcmRankingView> rows){StringBuilder out=new StringBuilder("名次,学号,姓名,本次名次,本场 AC,本次积分,历史均分,有效历史场数,历史总场数,综合分\r\n");for(AcmRankingView row:rows){List<String> fields=List.of(value(row.overallRank()),row.student().number(),row.student().name(),value(row.currentRank()),Integer.toString(row.currentCount()),value(row.currentPoints()),value(row.historyAverage()),Integer.toString(row.historyCount()),Integer.toString(row.historyTotal()),value(row.composite()));out.append(fields.stream().map(AssessmentController::csvCell).reduce((a,b)->a+","+b).orElse("")).append("\r\n");}return out.toString();}
    private static String csvCell(String text){String safe=text==null?"":text;if(!safe.isEmpty()&&"=+-@".indexOf(safe.charAt(0))>=0)safe="'"+safe;return "\""+safe.replace("\"","\"\"")+"\"";}
    private static String value(Object value){return value==null?"":value.toString();}
    private Map<String,Double> readNumberMap(String value){try{JsonNode node=mapper.readTree(value);var result=new java.util.LinkedHashMap<String,Double>();node.fields().forEachRemaining(e->{if(e.getValue().isNumber())result.put(e.getKey(),e.getValue().asDouble());});return result;}catch(Exception ex){return Map.of();}}
    private JsonNode parse(String value){try{return mapper.readTree(value);}catch(Exception ex){throw new IllegalStateException("Stored assessment JSON is invalid");}}
    private String write(Object value){try{return mapper.writeValueAsString(value);}catch(Exception ex){throw new IllegalStateException("Assessment data cannot be serialized",ex);}}
    private static ResponseStatusException hidden(){return new ResponseStatusException(NOT_FOUND,"考核资源不存在或无权访问");}

    private static TheoryRankingView theoryView(AssessmentScoringService.TheoryRankingRow row){return new TheoryRankingView(row.student(),row.grade(),row.currentScore(),row.currentRank(),row.history(),row.historyAverage(),row.historyCount(),row.historyTotal(),row.composite(),row.overallRank());}
    private static AcmRankingView acmView(AssessmentScoringService.AcmRankingRow row){return new AcmRankingView(row.student(),row.currentRank(),row.midRank(),row.currentCount(),row.currentPoints(),row.history(),row.historyAverage(),row.historyCount(),row.historyTotal(),row.composite(),row.overallRank());}
    public record TermView(UUID id,String name,LocalDate startsOn,LocalDate endsOn,boolean active,long version){}
    public record TermMemberView(UUID memberId,String displayName,String number,boolean veteran,long version){}
    public record ExamView(UUID id,UUID termId,String title,String kind,OffsetDateTime startsAt,int eventOrder,JsonNode rubricSnapshot,OffsetDateTime publishedAt,long version){}
    public record RubricView(String id,String label,double weight){}
    public record GradeRevisionView(UUID examId,UUID memberId,int revision,Double score,String status,Map<String,Double> parts,String comment,UUID actorId,OffsetDateTime createdAt,long examVersion){}
    public record TheoryRankingView(AssessmentScoringService.Student student,AssessmentScoringService.GradeMark grade,Double currentScore,Integer currentRank,List<AssessmentScoringService.TheoryHistoryItem> history,Double historyAverage,int historyCount,int historyTotal,Double composite,Integer overallRank){}
    public record AcmRankingView(AssessmentScoringService.Student student,Integer currentRank,Double midRank,int currentCount,Double currentPoints,List<AssessmentScoringService.AcmHistoryItem> history,Double historyAverage,int historyCount,int historyTotal,Double composite,Integer overallRank){}
    public record RankingPage<T>(List<T> items,long total,int page,int pageSize,String sourceVersion,String algorithmVersion,OffsetDateTime calculatedAt,int eligibleMemberCount){}
    public record ContestView(UUID id,String contestId,String title,String sourceVersion,OffsetDateTime endedAt,int eventOrder,boolean complete){}
    public record RankingPublication<T>(String sourceVersion,String algorithmVersion,OffsetDateTime calculatedAt,int eligibleMemberCount,List<T> rows){}
    public record PublishedView(UUID id,UUID termId,String kind,String sourceVersion,String algorithmVersion,OffsetDateTime publishedAt,JsonNode payload){}
    public record CreateTerm(@NotBlank @Size(max=120) String name,@NotNull LocalDate startsOn,@NotNull LocalDate endsOn,boolean active){}
    public record AddTermMember(@NotNull UUID memberId,boolean veteran){}
    public record VeteranInput(boolean veteran,@NotNull Long version){}
    public record RubricInput(@NotBlank @Size(max=80) String id,@NotBlank @Size(max=160) String label,double weight){}
    public record CreateExam(@NotBlank @Size(max=160) String title,@NotBlank String kind,@NotNull OffsetDateTime startsAt,Integer eventOrder,List<RubricInput> rubric){}
    public record SaveGrade(@NotBlank String status,Double score,Map<String,Double> parts,@Size(max=2000) String comment,@NotBlank @Size(max=1000) String reason){}
    private record SnapshotSource(UUID id,String contestId,String title,String termId,OffsetDateTime endedAt,int eventOrder,boolean complete){}
    private record PublishedSnapshot(UUID id,String sourceVersion,String payload,OffsetDateTime publishedAt){}
}
