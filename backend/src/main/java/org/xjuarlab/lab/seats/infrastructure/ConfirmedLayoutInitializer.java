package org.xjuarlab.lab.seats.infrastructure;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.util.UUID;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

@Component
public class ConfirmedLayoutInitializer implements ApplicationRunner {
    private final JdbcTemplate jdbc; private final ObjectMapper mapper; private final TransactionTemplate transactions;
    public ConfirmedLayoutInitializer(JdbcTemplate jdbc,ObjectMapper mapper,TransactionTemplate transactions){this.jdbc=jdbc;this.mapper=mapper;this.transactions=transactions;}
    @Override public void run(ApplicationArguments args) throws Exception {
        try(InputStream input=new ClassPathResource("seat-layout.confirmed.json").getInputStream()) {
            JsonNode baseline=mapper.readTree(input);
            transactions.executeWithoutResult(status -> initialize(baseline));
        }
    }
    private void initialize(JsonNode baseline) {
        Integer count=jdbc.queryForObject("SELECT count(*) FROM seat",Integer.class);
        if(count!=null&&count>0){
            if(count!=baseline.path("desks").size()) throw new IllegalStateException("Existing seat baseline is incomplete; inspect the room before startup");
            return;
        }
        UUID roomId=jdbc.queryForObject("INSERT INTO room(name,location) VALUES ('算法与科研实验室','信息楼A411') RETURNING id",UUID.class);
        for(JsonNode desk:baseline.path("desks")) {
            String originalKind=desk.path("kind").asText();
            String kind=originalKind.equals("seat")?"seat":originalKind.equals("printer")?"printer":"facility";
            try { jdbc.update("INSERT INTO seat(id,room_id,kind,layout_item) VALUES (?,?,?,?::jsonb)",desk.path("id").asText(),roomId,kind,mapper.writeValueAsString(desk)); }
            catch(Exception e){ throw new IllegalStateException("Confirmed seat layout could not be initialized",e); }
        }
        try { jdbc.update("INSERT INTO layout_revision(room_id,version,payload) VALUES (?,1,?::jsonb)",roomId,mapper.writeValueAsString(baseline)); }
        catch(Exception e){ throw new IllegalStateException("Confirmed layout revision could not be initialized",e); }
    }
}
