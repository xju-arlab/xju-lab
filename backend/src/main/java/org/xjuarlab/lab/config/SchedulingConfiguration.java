package org.xjuarlab.lab.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.context.annotation.Bean;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

@Configuration
@EnableScheduling
@Profile("!test")
public class SchedulingConfiguration {
    @Bean ThreadPoolTaskScheduler taskScheduler() { return scheduler("lab-schedule-"); }
    @Bean ThreadPoolTaskScheduler runnerScheduler() { return scheduler("hongqingting-"); }
    private ThreadPoolTaskScheduler scheduler(String prefix) {
        var scheduler=new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(1);
        scheduler.setThreadNamePrefix(prefix);
        return scheduler;
    }
}
