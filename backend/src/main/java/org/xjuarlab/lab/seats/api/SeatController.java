package org.xjuarlab.lab.seats.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.HashSet;
import java.util.List;
import java.util.ArrayList;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.xjuarlab.lab.security.CurrentMember;
import org.xjuarlab.lab.api.PageEnvelope;
import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.CONFLICT;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@RestController
@RequestMapping("/api/v1/seats")
public class SeatController {
    private final JdbcTemplate jdbc; private final CurrentMember current; private final ObjectMapper mapper;
    public SeatController(JdbcTemplate jdbc,CurrentMember current,ObjectMapper mapper){this.jdbc=jdbc;this.current=current;this.mapper=mapper;}

    @GetMapping public PageEnvelope<SeatView> list(Authentication auth,@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="100") int pageSize){
        current.id(auth);
        long offset=PageEnvelope.offset(page,pageSize);
        List<SeatView> items=jdbc.query("SELECT s.id,s.kind,s.layout_item,a.member_id,m.display_name,m.direction,m.class_name,m.directions::text AS directions_json,m.cohort,EXISTS(SELECT 1 FROM leave_application l WHERE l.member_id=m.id AND l.status='APPROVED' AND l.starts_at<=now() AND l.ends_at>now()) AS on_leave_now FROM seat s LEFT JOIN seat_assignment a ON a.seat_id=s.id AND a.released_at IS NULL LEFT JOIN member m ON m.id=a.member_id AND m.active=true ORDER BY s.id LIMIT ? OFFSET ?",
            (rs,row)->new SeatView(rs.getString("id"),rs.getString("kind"),parse(rs.getString("layout_item")),rs.getObject("member_id",UUID.class),rs.getString("display_name"),rs.getString("direction"),rs.getString("class_name"),strings(rs.getString("directions_json")),rs.getObject("cohort",Integer.class),rs.getBoolean("on_leave_now")),pageSize,offset);
        Long total=jdbc.queryForObject("SELECT count(*) FROM seat",Long.class);
        return new PageEnvelope<>(items,total==null?0:total,page,pageSize);
    }

    @GetMapping("/layout") public LayoutResponse layout(Authentication auth){current.id(auth);return currentLayout();}

    @PutMapping("/layout") @Transactional public LayoutResponse saveLayout(Authentication auth,@RequestHeader("If-Match-Version") long expectedVersion,@RequestBody JsonNode layout){
        UUID actor=current.id(auth);current.requireRole(actor,"LAB_ADMIN","SUPER_ADMIN");
        LayoutResponse old=currentLayoutForUpdate();
        if(old.version()!=expectedVersion)throw new ResponseStatusException(CONFLICT,"工位布局已被其他管理员修改，请重新加载");
        validateLayout(layout);
        long next=old.version()+1;
        String json;
        try{json=mapper.writeValueAsString(layout);}catch(Exception e){throw new ResponseStatusException(BAD_REQUEST,"布局格式无效");}
        UUID roomId=jdbc.queryForObject("SELECT room_id FROM seat LIMIT 1",UUID.class);
        jdbc.update("INSERT INTO layout_revision(room_id,version,payload,actor_id) VALUES (?,?,?::jsonb,?)",roomId,next,json,actor);
        for(JsonNode desk:layout.path("desks"))try{jdbc.update("UPDATE seat SET layout_item=?::jsonb WHERE id=?",mapper.writeValueAsString(desk),desk.path("id").asText());}catch(Exception e){throw new ResponseStatusException(BAD_REQUEST,"布局内容无法保存");}
        jdbc.update("INSERT INTO audit_event(actor_id,action,target_type,target_id,after_summary) VALUES (?,'SAVE_SEAT_LAYOUT','room',?,jsonb_build_object('version',?))",actor,roomId.toString(),next);
        return new LayoutResponse(next,layout);
    }

    @PutMapping("/{seatId}/assignment") @Transactional public AssignmentView assign(Authentication auth,@PathVariable String seatId,@RequestBody AssignmentRequest body){
        UUID actor=current.id(auth);current.requireRole(actor,"LAB_ADMIN","SUPER_ADMIN");
        var seat=jdbc.query("SELECT kind FROM seat WHERE id=?",(rs,row)->rs.getString(1),seatId);
        if(seat.isEmpty())throw new ResponseStatusException(NOT_FOUND,"工位不存在");
        if(!seat.getFirst().equals("seat"))throw new ResponseStatusException(BAD_REQUEST,"设施、打印机不能分配给成员");
        var member=jdbc.query("SELECT display_name,direction,class_name,directions::text AS directions_json,cohort FROM member WHERE id=? AND active=true",(rs,row)->new AssignmentView(seatId,body.memberId(),rs.getString("display_name"),rs.getString("direction"),rs.getString("class_name"),strings(rs.getString("directions_json")),rs.getObject("cohort",Integer.class)),body.memberId());
        if(member.isEmpty())throw new ResponseStatusException(NOT_FOUND,"有效成员不存在");
        Integer existing=jdbc.query("SELECT 1 FROM seat_assignment WHERE seat_id=? AND member_id=? AND released_at IS NULL",(rs,row)->rs.getInt(1),seatId,body.memberId()).stream().findFirst().orElse(null);
        if(existing!=null)return member.getFirst();
        jdbc.update("INSERT INTO seat_assignment(seat_id,member_id,assigned_by) VALUES (?,?,?)",seatId,body.memberId(),actor);
        jdbc.update("INSERT INTO audit_event(actor_id,action,target_type,target_id,after_summary) VALUES (?,'ASSIGN_SEAT','seat',?,jsonb_build_object('memberId',?::text))",actor,seatId,body.memberId());
        return member.getFirst();
    }

    @DeleteMapping("/{seatId}/assignment") @Transactional public void release(Authentication auth,@PathVariable String seatId){
        UUID actor=current.id(auth);current.requireRole(actor,"LAB_ADMIN","SUPER_ADMIN");
        int changed=jdbc.update("UPDATE seat_assignment SET released_at=now() WHERE seat_id=? AND released_at IS NULL",seatId);
        if(changed==0)throw new ResponseStatusException(NOT_FOUND,"活动分配不存在");
        jdbc.update("INSERT INTO audit_event(actor_id,action,target_type,target_id) VALUES (?,'RELEASE_SEAT','seat',?)",actor,seatId);
    }

    private LayoutResponse currentLayout(){
        return jdbc.query("SELECT version,payload FROM layout_revision ORDER BY version DESC LIMIT 1",(rs,row)->new LayoutResponse(rs.getLong(1),parse(rs.getString(2))))
            .stream().findFirst().orElseThrow(()->new ResponseStatusException(NOT_FOUND,"工位布局尚未初始化"));
    }
    private LayoutResponse currentLayoutForUpdate(){return jdbc.query("SELECT version,payload FROM layout_revision ORDER BY version DESC LIMIT 1 FOR UPDATE",(rs,row)->new LayoutResponse(rs.getLong(1),parse(rs.getString(2)))).stream().findFirst().orElseThrow(()->new ResponseStatusException(NOT_FOUND,"工位布局尚未初始化"));}
    private JsonNode parse(String value){try{return mapper.readTree(value);}catch(Exception e){throw new IllegalStateException("Persisted JSON is invalid",e);}}
    private List<String> strings(String value){if(value==null)return List.of();JsonNode node=parse(value);List<String> result=new ArrayList<>();if(node.isArray())node.forEach(item->{if(item.isTextual())result.add(item.asText());});return List.copyOf(result);}
    private void validateLayout(JsonNode layout){
        JsonNode canvas=layout.path("canvas"), desks=layout.path("desks");
        if(!canvas.isObject()||canvas.path("width").asDouble()!=1400||canvas.path("height").asDouble()!=1060||!desks.isArray())throw new ResponseStatusException(BAD_REQUEST,"布局画布或桌位列表无效");
        validateRoom(layout.path("room"));
        Set<String> expected=new HashSet<>(jdbc.query("SELECT id FROM seat",(rs,row)->rs.getString(1)));
        Set<String> received=new HashSet<>();
        for(JsonNode desk:desks){
            String id=desk.path("id").asText();
            double x=desk.path("x").asDouble(Double.NaN),y=desk.path("y").asDouble(Double.NaN),width=desk.path("width").asDouble(Double.NaN),depth=desk.path("depth").asDouble(Double.NaN);
            String facing=desk.path("facing").asText();
            if(!Set.of("up","down","left","right").contains(facing))throw new ResponseStatusException(BAD_REQUEST,"桌位朝向无效");
            boolean vertical=facing.equals("left")||facing.equals("right");
            double halfX=(vertical?depth:width)/2,halfY=(vertical?width:depth)/2;
            if(id.isBlank()||!received.add(id)||!expected.contains(id)||!Double.isFinite(x)||!Double.isFinite(y)||!Double.isFinite(width)||!Double.isFinite(depth)||width<40||width>300||depth<30||depth>200||x-halfX<0||y-halfY<0||x+halfX>1400||y+halfY>1060)throw new ResponseStatusException(BAD_REQUEST,"布局包含未知桌位或越界坐标");
            String actualKind=desk.path("kind").asText();
            String baselineKind=jdbc.queryForObject("SELECT layout_item->>'kind' FROM seat WHERE id=?",String.class,id);
            if(!baselineKind.equals(actualKind))throw new ResponseStatusException(BAD_REQUEST,"不能改变工位/设施类型");
        }
        if(!received.equals(expected))throw new ResponseStatusException(BAD_REQUEST,"不能删除或遗漏已确认布局中的桌位");
    }
    private void validateRoom(JsonNode r){
        range(r,"left",30,300);range(r,"top",70,200);range(r,"right",r.path("left").asDouble()+700,1330);range(r,"bottom",r.path("top").asDouble()+650,990);
        range(r,"notchWidth",50,350);range(r,"notchHeight",100,350);
        String wall=r.path("doorWall").asText();
        if(!Set.of("notch","left","top").contains(wall)||!Set.of("left","right").contains(r.path("doorSide").asText())||!r.path("doorUpperClosed").isBoolean())throw new ResponseStatusException(BAD_REQUEST,"门窗参数无效");
        double span=wall.equals("notch")?r.path("notchHeight").asDouble():wall.equals("left")?r.path("bottom").asDouble()-r.path("top").asDouble()-r.path("notchHeight").asDouble():r.path("right").asDouble()-r.path("left").asDouble()-r.path("notchWidth").asDouble();
        range(r,"doorWidth",50,Math.min(240,span-12));range(r,"doorOffset",6,span-r.path("doorWidth").asDouble()-6);
        range(r,"windowLength",100,r.path("bottom").asDouble()-r.path("top").asDouble()-40);range(r,"windowOffset",20,r.path("bottom").asDouble()-r.path("top").asDouble()-r.path("windowLength").asDouble()-20);
        range(r,"toolWidth",60,400);range(r,"toolHeight",40,300);range(r,"toolX",0,1400-r.path("toolWidth").asDouble());range(r,"toolY",0,1060-r.path("toolHeight").asDouble());
    }
    private void range(JsonNode object,String field,double min,double max){
        JsonNode value=object.path(field);double number=value.asDouble(Double.NaN);
        if(!value.isNumber()||!Double.isFinite(number)||number<min||number>max)throw new ResponseStatusException(BAD_REQUEST,"墙窗尺寸或位置超出范围");
    }
    public record LayoutResponse(long version,JsonNode layout){}
    public record SeatView(String id,String kind,JsonNode layoutItem,UUID memberId,String displayName,String direction,String className,List<String> directions,Integer cohort,boolean onLeaveNow){}
    public record AssignmentRequest(UUID memberId){}
    public record AssignmentView(String seatId,UUID memberId,String displayName,String direction,String className,List<String> directions,Integer cohort){}
}
