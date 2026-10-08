package org.xjuarlab.lab.hongqingting.application;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.xjuarlab.lab.hongqingting.infrastructure.RunnerClient;
import org.xjuarlab.lab.hongqingting.domain.RunnerContracts.Outcome;

@Component
public class RunnerWorker {
    private final RunnerBatches batches;
    private final RunnerClient client;
    public RunnerWorker(RunnerBatches batches,RunnerClient client) { this.batches=batches; this.client=client; }
    @Scheduled(fixedDelay=2000,scheduler="runnerScheduler")
    public void poll() {
        if(!client.configured()) return;
        var attempt=batches.claim();
        if(attempt==null) return;
        Outcome result;
        try { result=client.upload(attempt); }
        catch(RuntimeException ex) { result=new Outcome("UNKNOWN","请求中断，提交结果待核实，未自动重试"); }
        // No network request holds a database transaction or row lock.
        batches.finish(attempt,result);
    }
}
