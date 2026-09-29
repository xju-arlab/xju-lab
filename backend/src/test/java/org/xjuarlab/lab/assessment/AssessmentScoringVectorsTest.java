package org.xjuarlab.lab.assessment;

import static org.assertj.core.api.Assertions.assertThat;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class AssessmentScoringVectorsTest {
    private final ObjectMapper mapper=new ObjectMapper();
    private final AssessmentScoringService scoring=new AssessmentScoringService();

    @Test void backendUsesTheSharedCrossLanguageScoringVectors() throws Exception {
        JsonNode root=mapper.readTree(Files.readString(Path.of("../contracts/assessment-scoring-vectors.json")));
        assertThat(root.path("algorithmVersion").asText()).isEqualTo(AssessmentScoringService.ALGORITHM_VERSION);
        for(JsonNode item:root.path("rankPoints")){Double expected=nullable(item.path("expected"));assertThat(AssessmentScoringService.rankPoints(item.path("midRank").asDouble(),item.path("count").asInt())).isEqualTo(expected);}
        for(JsonNode item:root.path("blend")){Double expected=nullable(item.path("expected"));assertThat(AssessmentScoringService.blend(nullable(item.path("current")),nullable(item.path("history")))).isEqualTo(expected);}
        assertAcm(root.path("acm"));
        assertTheory(root.path("theory"));
    }

    private void assertAcm(JsonNode vector){
        List<AssessmentScoringService.Student> students=new ArrayList<>();for(JsonNode s:vector.path("students"))students.add(new AssessmentScoringService.Student(s.path("id").asText(),s.path("number").asText(),s.path("name").asText(),s.path("veteran").asBoolean()));
        List<AssessmentScoringService.AcmContest> contests=new ArrayList<>();for(JsonNode c:vector.path("contests")){List<AssessmentScoringService.ContestResult> results=new ArrayList<>();for(JsonNode r:c.path("results"))results.add(new AssessmentScoringService.ContestResult(r.path("studentId").asText(),r.path("solved").asInt(),r.path("penalty").asLong()));contests.add(new AssessmentScoringService.AcmContest(c.path("id").asText(),c.path("title").asText(),c.path("termId").asText(),Instant.parse(c.path("endedAt").asText()),c.path("eventOrder").asInt(),c.path("complete").asBoolean(),results));}
        var rows=scoring.acm(students,contests,vector.path("selectedId").asText(),vector.path("excludeVeterans").asBoolean());
        for(JsonNode e:vector.path("expected")){var row=rows.stream().filter(r->r.student().id().equals(e.path("studentId").asText())).findFirst().orElseThrow();assertThat(row.currentRank()).isEqualTo(nullableInt(e.path("currentRank")));assertThat(row.currentPoints()).isEqualTo(nullable(e.path("currentPoints")));assertThat(row.historyAverage()).isEqualTo(nullable(e.path("historyAverage")));assertThat(row.historyCount()).isEqualTo(e.path("historyCount").asInt());assertThat(row.historyTotal()).isEqualTo(e.path("historyTotal").asInt());assertThat(row.composite()).isEqualTo(nullable(e.path("composite")));assertThat(row.overallRank()).isEqualTo(nullableInt(e.path("overallRank")));}
    }

    private void assertTheory(JsonNode vector){
        List<AssessmentScoringService.Student> students=new ArrayList<>();for(JsonNode s:vector.path("students"))students.add(new AssessmentScoringService.Student(s.path("id").asText(),s.path("number").asText(),s.path("name").asText(),s.path("veteran").asBoolean()));
        List<AssessmentScoringService.TheoryExam> exams=new ArrayList<>();for(JsonNode exam:vector.path("exams")){List<AssessmentScoringService.GradeMark> grades=new ArrayList<>();for(JsonNode g:exam.path("grades"))grades.add(new AssessmentScoringService.GradeMark(g.path("studentId").asText(),g.path("status").asText(),nullable(g.path("score")),Map.of(),null,1));exams.add(new AssessmentScoringService.TheoryExam(exam.path("id").asText(),exam.path("title").asText(),exam.path("termId").asText(),exam.path("kind").asText(),Instant.parse(exam.path("startsAt").asText()),exam.path("eventOrder").asInt(),grades));}
        var rows=scoring.theory(students,exams,vector.path("selectedId").asText());
        for(JsonNode e:vector.path("expected")){var row=rows.stream().filter(r->r.student().id().equals(e.path("studentId").asText())).findFirst().orElseThrow();assertThat(row.currentRank()).isEqualTo(nullableInt(e.path("currentRank")));assertThat(row.currentScore()).isEqualTo(nullable(e.path("currentScore")));assertThat(row.historyAverage()).isEqualTo(nullable(e.path("historyAverage")));assertThat(row.historyCount()).isEqualTo(e.path("historyCount").asInt());assertThat(row.historyTotal()).isEqualTo(e.path("historyTotal").asInt());assertThat(row.composite()).isEqualTo(nullable(e.path("composite")));assertThat(row.overallRank()).isEqualTo(nullableInt(e.path("overallRank")));}
    }
    private static Double nullable(JsonNode n){return n==null||n.isNull()?null:n.asDouble();}
    private static Integer nullableInt(JsonNode n){return n==null||n.isNull()?null:n.asInt();}
}
