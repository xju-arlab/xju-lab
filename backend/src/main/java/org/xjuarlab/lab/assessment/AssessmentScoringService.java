package org.xjuarlab.lab.assessment;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import org.springframework.stereotype.Component;

@Component
public class AssessmentScoringService {
    public static final String ALGORITHM_VERSION="xju-ranking-v1";
    public static final double HISTORY_WEIGHT=0.25;
    public static final double CURRENT_WEIGHT=0.75;
    public static boolean validScore(Double value){return value!=null&&Double.isFinite(value)&&value>=0&&value<=100;}
    public static Double rankPoints(double midRank,int count){if(!Double.isFinite(midRank)||count<1||midRank<1||midRank>count)return null;return count==1?50d:100d*(count-midRank)/(count-1);}
    public static Double blend(Double current,Double history){return current==null?null:history==null?current:CURRENT_WEIGHT*current+HISTORY_WEIGHT*history;}
    public static Double rubricScore(Map<String,Double> parts,List<RubricCriterion> criteria){
        if(criteria==null||criteria.isEmpty()||Math.abs(criteria.stream().mapToDouble(RubricCriterion::weight).sum()-1d)>1e-9)return null;
        double total=0;for(RubricCriterion item:criteria){Double score=parts==null?null:parts.get(item.id());if(!validScore(score))return null;total+=score*item.weight();}return total;
    }

    public List<AcmRankingRow> acm(List<Student> students,List<AcmContest> contests,String selectedId,boolean excludeVeterans){
        AcmContest selected=contests.stream().filter(c->c.id().equals(selectedId)).findFirst().orElseThrow(()->new IllegalArgumentException("Selected contest is missing"));
        if(!selected.complete()||selected.endedAt()==null)throw new IllegalArgumentException("Only complete ended contests can be ranked");
        List<Student> eligible=students.stream().filter(s->!excludeVeterans||!s.veteran()).toList();
        List<AcmContest> previous=contests.stream().filter(c->c.complete()&&c.endedAt()!=null&&c.termId().equals(selected.termId())&&before(c,selected)).sorted(Comparator.comparing(AcmContest::endedAt).thenComparingInt(AcmContest::eventOrder)).toList();
        Map<String,RankedContestResult> current=rankContest(selected,eligible).stream().collect(java.util.stream.Collectors.toMap(r->r.student().id(),Function.identity()));
        List<Map<String,RankedContestResult>> past=previous.stream().map(c->rankContest(c,eligible).stream().collect(java.util.stream.Collectors.toMap(r->r.student().id(),Function.identity()))).toList();
        List<AcmRankingRow> rows=new ArrayList<>();
        for(Student student:eligible){
            RankedContestResult currentResult=current.get(student.id());List<AcmHistoryItem> history=new ArrayList<>();List<Double> scores=new ArrayList<>();
            for(int i=0;i<previous.size();i++){RankedContestResult value=past.get(i).get(student.id());history.add(new AcmHistoryItem(previous.get(i).id(),previous.get(i).title(),previous.get(i).endedAt(),value));if(value!=null)scores.add(value.points());}
            Double historyAverage=mean(scores);Double currentPoints=currentResult==null?null:currentResult.points();
            rows.add(new AcmRankingRow(student,currentResult==null?null:currentResult.rank(),currentResult==null?null:currentResult.midRank(),currentResult==null?0:currentResult.count(),currentPoints,history,historyAverage,scores.size(),previous.size(),blend(currentPoints,historyAverage),null));
        }
        return overallRanks(rows,AcmRankingRow::student,AcmRankingRow::composite,(row,rank)->new AcmRankingRow(row.student(),row.currentRank(),row.midRank(),row.currentCount(),row.currentPoints(),row.history(),row.historyAverage(),row.historyCount(),row.historyTotal(),row.composite(),rank));
    }

    public List<TheoryRankingRow> theory(List<Student> students,List<TheoryExam> exams,String selectedId){
        TheoryExam selected=exams.stream().filter(e->e.id().equals(selectedId)).findFirst().orElseThrow(()->new IllegalArgumentException("Selected exam is missing"));
        List<TheoryExam> previous=exams.stream().filter(e->e.termId().equals(selected.termId())&&before(e.startsAt(),e.eventOrder(),selected.startsAt(),selected.eventOrder())).sorted(Comparator.comparing(TheoryExam::startsAt).thenComparingInt(TheoryExam::eventOrder)).toList();
        Map<String,GradeMark> current=selected.grades().stream().collect(java.util.stream.Collectors.toMap(GradeMark::studentId,Function.identity(),(first,second)->second));Map<String,Integer> currentRanks=scoreRanks(students,current);
        List<TheoryRankingRow> rows=new ArrayList<>();
        for(Student student:students){
            GradeMark currentGrade=current.get(student.id());Double currentScore=effectiveGrade(currentGrade);List<TheoryHistoryItem> history=new ArrayList<>();List<Double> scores=new ArrayList<>();
            for(TheoryExam exam:previous){GradeMark grade=exam.grades().stream().filter(g->g.studentId().equals(student.id())).reduce((first,second)->second).orElse(null);Double score=effectiveGrade(grade);history.add(new TheoryHistoryItem(exam.id(),exam.title(),exam.startsAt(),exam.kind(),grade,score));if(score!=null)scores.add(score);}
            Double historyAverage=mean(scores);rows.add(new TheoryRankingRow(student,currentGrade,currentScore,currentRanks.get(student.id()),history,historyAverage,scores.size(),previous.size(),blend(currentScore,historyAverage),null));
        }
        return overallRanks(rows,TheoryRankingRow::student,TheoryRankingRow::composite,(row,rank)->new TheoryRankingRow(row.student(),row.grade(),row.currentScore(),row.currentRank(),row.history(),row.historyAverage(),row.historyCount(),row.historyTotal(),row.composite(),rank));
    }

    public List<RankedContestResult> rankContest(AcmContest contest,List<Student> students){
        Map<String,Student> eligible=students.stream().collect(java.util.stream.Collectors.toMap(Student::id,Function.identity()));
        List<ContestResult> ordered=contest.results().stream().filter(r->eligible.containsKey(r.studentId())).sorted(Comparator.comparingInt(ContestResult::solved).reversed().thenComparingLong(ContestResult::penalty).thenComparing(r->eligible.get(r.studentId()).number())).toList();
        List<RankedContestResult> out=new ArrayList<>();
        for(int start=0;start<ordered.size();){int end=start+1;while(end<ordered.size()&&ordered.get(end).solved()==ordered.get(start).solved()&&ordered.get(end).penalty()==ordered.get(start).penalty())end++;double mid=(start+1+end)/2d;int shownRank=start+1,count=ordered.size();for(int i=start;i<end;i++){ContestResult result=ordered.get(i);out.add(new RankedContestResult(eligible.get(result.studentId()),result.solved(),result.penalty(),shownRank,mid,end-start>1,count,rankPoints(mid,count)));}start=end;}
        return List.copyOf(out);
    }
    private Map<String,Integer> scoreRanks(List<Student> students,Map<String,GradeMark> grades){
        List<Student> ranked=students.stream().filter(s->effectiveGrade(grades.get(s.id()))!=null).sorted(Comparator.comparing((Student s)->effectiveGrade(grades.get(s.id()))).reversed().thenComparing(Student::number)).toList();Map<String,Integer> result=new HashMap<>();int rank=0;Double previous=null;
        for(int i=0;i<ranked.size();i++){Student student=ranked.get(i);double score=effectiveGrade(grades.get(student.id()));if(previous==null||Math.abs(previous-score)>1e-9)rank=i+1;result.put(student.id(),rank);previous=score;}return result;
    }
    private <T> List<T> overallRanks(List<T> values,Function<T,Student> student,Function<T,Double> score,RankReplacement<T> replace){
        List<T> sorted=values.stream().sorted(Comparator.<T>comparingDouble(v->score.apply(v)==null?-1d:score.apply(v)).reversed().thenComparing(v->student.apply(v).number())).toList();List<T> result=new ArrayList<>();int rank=0;Double previous=null;
        for(int i=0;i<sorted.size();i++){T row=sorted.get(i);Double value=score.apply(row);if(value!=null){if(previous==null||Math.abs(previous-value)>1e-9)rank=i+1;result.add(replace.apply(row,rank));previous=value;}else result.add(replace.apply(row,null));}return List.copyOf(result);
    }
    private static Double effectiveGrade(GradeMark grade){return grade!=null&&"GRADED".equals(grade.status())&&validScore(grade.score())?grade.score():null;}
    private static Double mean(List<Double> values){return values.isEmpty()?null:values.stream().mapToDouble(Double::doubleValue).average().orElseThrow();}
    private static boolean before(AcmContest earlier,AcmContest selected){return before(earlier.endedAt(),earlier.eventOrder(),selected.endedAt(),selected.eventOrder());}
    private static boolean before(Instant earlier,int earlierOrder,Instant selected,int selectedOrder){return earlier.isBefore(selected)||(earlier.equals(selected)&&earlierOrder<selectedOrder);}
    @FunctionalInterface private interface RankReplacement<T>{T apply(T value,Integer rank);}

    public record Student(String id,String number,String name,boolean veteran){}
    public record ContestResult(String studentId,int solved,long penalty){}
    public record AcmContest(String id,String title,String termId,Instant endedAt,int eventOrder,boolean complete,List<ContestResult> results){}
    public record RankedContestResult(Student student,int solved,long penalty,int rank,double midRank,boolean tied,int count,double points){}
    public record AcmHistoryItem(String id,String title,Instant endedAt,RankedContestResult result){}
    public record AcmRankingRow(Student student,Integer currentRank,Double midRank,int currentCount,Double currentPoints,List<AcmHistoryItem> history,Double historyAverage,int historyCount,int historyTotal,Double composite,Integer overallRank){}
    public record GradeMark(String studentId,String status,Double score,Map<String,Double> parts,String comment,int revision){}
    public record TheoryExam(String id,String title,String termId,String kind,Instant startsAt,int eventOrder,List<GradeMark> grades){}
    public record TheoryHistoryItem(String id,String title,Instant startsAt,String kind,GradeMark grade,Double score){}
    public record TheoryRankingRow(Student student,GradeMark grade,Double currentScore,Integer currentRank,List<TheoryHistoryItem> history,Double historyAverage,int historyCount,int historyTotal,Double composite,Integer overallRank){}
    public record RubricCriterion(String id,double weight){}
}
